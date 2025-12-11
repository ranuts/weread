#!/usr/bin/env python3
"""
章节分类模型训练脚本
用于训练 ONNX 格式的章节提取模型
"""

import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from sklearn.model_selection import train_test_split
import onnx
from onnxruntime import InferenceSession
import os
import sys

# ==================== 数据加载 ====================

class ChapterDataset(Dataset):
    def __init__(self, samples, vocab_size=20000, max_length=256):
        self.samples = samples
        self.vocab_size = vocab_size
        self.max_length = max_length
        self.vocab = self.build_vocab()
        
    def build_vocab(self):
        """构建词汇表（与 TypeScript 保持一致）"""
        vocab = {}
        basic_tokens = [
            '<PAD>', '<UNK>', '<CLS>', '<SEP>', '[EMPTY]',
            '第', '章', '节', '卷', '部', '回',
            'Chapter', 'Section', 'Part', 'Book',
            '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
            '百', '千', '万', '亿',
            '.', '、', '，', '。', '：', '；',
        ]
        
        for idx, token in enumerate(basic_tokens):
            vocab[token] = idx
        
        # 添加常见字符
        for i in range(256):
            char = chr(i)
            if char not in vocab:
                vocab[char] = len(vocab)
        
        return vocab
    
    def tokenize(self, text):
        """分词（与 TypeScript 保持一致）"""
        tokens = []
        for char in text:
            if len(tokens) >= self.max_length:
                break
            token_id = self.vocab.get(char, self.vocab.get('<UNK>', 1))
            tokens.append(token_id)
        
        # 填充
        while len(tokens) < self.max_length:
            tokens.append(self.vocab.get('<PAD>', 0))
        
        return tokens[:self.max_length]
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        
        # 构建上下文字符串（与 TypeScript 保持一致）
        if sample.get('context'):
            ctx = sample['context']
            prev = '[EMPTY]' if ctx.get('hasPrevEmpty') else (ctx.get('prevLine', '')[-20:] or '')
            next_line = '[EMPTY]' if ctx.get('hasNextEmpty') else (ctx.get('nextLine', '')[:20] or '')
            text = f"{prev} | {sample['text']} | {next_line}"
        else:
            text = sample['text']
        
        tokens = self.tokenize(text)
        label = 1 if sample['isChapter'] else 0
        
        return torch.LongTensor(tokens), torch.tensor(label, dtype=torch.long)

# ==================== 模型定义 ====================

class ChapterClassifier(nn.Module):
    def __init__(self, vocab_size=20000, embedding_dim=128, hidden_dim=256, max_length=256, num_classes=2):
        super(ChapterClassifier, self).__init__()
        self.embedding = nn.Embedding(vocab_size, embedding_dim, padding_idx=0)
        self.lstm = nn.LSTM(
            embedding_dim, 
            hidden_dim, 
            batch_first=True, 
            bidirectional=True,
            num_layers=2,
            dropout=0.2
        )
        self.dropout = nn.Dropout(0.3)
        self.fc = nn.Linear(hidden_dim * 2, num_classes)
        
    def forward(self, x):
        # x: [batch_size, max_length]
        x = self.embedding(x)  # [batch_size, max_length, embedding_dim]
        lstm_out, (h_n, c_n) = self.lstm(x)
        # 使用最后一个时间步的输出
        output = self.fc(self.dropout(lstm_out[:, -1, :]))  # [batch_size, num_classes]
        return output

# ==================== 训练函数 ====================

def train_model(training_data_path, output_model_path, epochs=20, batch_size=32, learning_rate=0.001):
    # 加载训练数据
    print("Loading training data...")
    with open(training_data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    samples = data['samples']
    print(f"Total samples: {len(samples)}")
    print(f"Positive samples: {sum(1 for s in samples if s['isChapter'])}")
    print(f"Negative samples: {sum(1 for s in samples if not s['isChapter'])}")
    
    # 划分训练集和验证集
    train_samples, val_samples = train_test_split(samples, test_size=0.2, random_state=42)
    
    # 创建数据集
    train_dataset = ChapterDataset(train_samples)
    val_dataset = ChapterDataset(val_samples)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    # 创建模型
    vocab_size = len(train_dataset.vocab)
    model = ChapterClassifier(vocab_size=vocab_size)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model.to(device)
    print(f"Using device: {device}")
    
    # 损失函数和优化器
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=learning_rate)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=3)
    
    # 训练循环
    best_val_loss = float('inf')
    for epoch in range(epochs):
        # 训练阶段
        model.train()
        train_loss = 0
        train_correct = 0
        train_total = 0
        
        for tokens, labels in train_loader:
            tokens = tokens.to(device)
            labels = labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(tokens)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            train_total += labels.size(0)
            train_correct += (predicted == labels).sum().item()
        
        # 验证阶段
        model.eval()
        val_loss = 0
        val_correct = 0
        val_total = 0
        
        with torch.no_grad():
            for tokens, labels in val_loader:
                tokens = tokens.to(device)
                labels = labels.to(device)
                
                outputs = model(tokens)
                loss = criterion(outputs, labels)
                
                val_loss += loss.item()
                _, predicted = torch.max(outputs.data, 1)
                val_total += labels.size(0)
                val_correct += (predicted == labels).sum().item()
        
        train_acc = 100 * train_correct / train_total
        val_acc = 100 * val_correct / val_total
        avg_train_loss = train_loss / len(train_loader)
        avg_val_loss = val_loss / len(val_loader)
        
        scheduler.step(avg_val_loss)
        
        print(f'Epoch [{epoch+1}/{epochs}]')
        print(f'  Train Loss: {avg_train_loss:.4f}, Train Acc: {train_acc:.2f}%')
        print(f'  Val Loss: {avg_val_loss:.4f}, Val Acc: {val_acc:.2f}%')
        
        # 保存最佳模型
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            torch.save(model.state_dict(), output_model_path.replace('.onnx', '.pth'))
            print(f'  ✓ Saved best model (val_loss: {avg_val_loss:.4f})')
    
    return model

# ==================== 导出 ONNX ====================

def export_to_onnx(model, output_path, vocab_size=20000, max_length=256):
    """导出模型为 ONNX 格式"""
    model.eval()
    
    # 创建示例输入
    dummy_input = torch.randint(0, vocab_size, (1, max_length), dtype=torch.long)
    
    # 导出
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={
            'input': {0: 'batch_size'},
            'output': {0: 'batch_size'}
        },
        opset_version=11,
        do_constant_folding=True,
    )
    
    # 验证 ONNX 模型
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print(f"✓ ONNX model exported successfully: {output_path}")
    print(f"  Model size: {onnx_model.ByteSize() / 1024 / 1024:.2f} MB")

# ==================== 主函数 ====================

def main():
    # 配置
    training_data_path = os.path.join(os.path.dirname(__file__), 'training_data.json')
    output_model_path = os.path.join(os.path.dirname(__file__), 'chapter_classifier.onnx')
    epochs = 20
    batch_size = 32
    learning_rate = 0.001
    
    # 检查训练数据文件
    if not os.path.exists(training_data_path):
        print(f"Error: Training data file not found: {training_data_path}")
        print("\nPlease:")
        print("1. Generate training data using TypeScript (ONNXModelTrainer)")
        print("2. Export to JSON format")
        print("3. Save as training_data.json in the training/ directory")
        sys.exit(1)
    
    print("=" * 50)
    print("Chapter Classifier Training")
    print("=" * 50)
    
    # 训练模型
    model = train_model(
        training_data_path,
        output_model_path,
        epochs=epochs,
        batch_size=batch_size,
        learning_rate=learning_rate
    )
    
    # 导出 ONNX
    print("\nExporting to ONNX...")
    vocab_size = 20000  # 与训练时保持一致
    max_length = 256
    export_to_onnx(model, output_model_path, vocab_size, max_length)
    
    print("\n" + "=" * 50)
    print("Training completed!")
    print(f"Model saved to: {output_model_path}")
    print("\nNext steps:")
    print(f"1. Copy {output_model_path} to public/models/")
    print("2. Test the model in browser")
    print("=" * 50)

if __name__ == '__main__':
    main()
