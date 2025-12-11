# ONNX 模型训练完整指南

## 概述

本指南将帮助你训练一个用于章节提取的 ONNX 模型，可以在浏览器中使用。

## 训练流程

```
1. 准备训练数据（TypeScript）
   ↓
2. 导出为 JSON 格式
   ↓
3. 在 Python 中训练模型（PyTorch）
   ↓
4. 导出为 ONNX 格式
   ↓
5. 部署到 public/models/
```

## 步骤 1：准备训练数据

### 使用 TypeScript 工具生成训练数据

```typescript
import { ONNXModelTrainer } from '@/lib/onnxModelTrainer';

// 从书籍文本生成训练数据
const bookText = `...`; // 你的书籍文本
const knownChapters = ['一', '二', '三', '第一章', '第二章']; // 已知的章节标题

const trainingData = ONNXModelTrainer.generateTrainingData(
  bookText,
  knownChapters,
  {
    includeContext: true, // 包含上下文特征
    balanceSamples: true, // 平衡正负样本
  }
);

// 导出为 JSON
const jsonData = ONNXModelTrainer.exportTrainingData(trainingData);
console.log(jsonData);

// 或者保存到文件
const blob = new Blob([jsonData], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'training_data.json';
a.click();
```

### 训练数据格式

生成的 JSON 格式如下：

```json
{
  "samples": [
    {
      "text": "一",
      "isChapter": true,
      "context": {
        "prevLine": "",
        "nextLine": "我们所要介绍的是祥子...",
        "hasPrevEmpty": true,
        "hasNextEmpty": true
      }
    },
    {
      "text": "我们所要介绍的是祥子...",
      "isChapter": false,
      "context": {
        "prevLine": "一",
        "nextLine": "北平的洋车夫有许多派...",
        "hasPrevEmpty": false,
        "hasNextEmpty": false
      }
    }
  ],
  "metadata": {
    "totalSamples": 1000,
    "positiveSamples": 200,
    "negativeSamples": 800,
    "languages": ["zh"]
  }
}
```

## 步骤 2：Python 训练环境设置

### 安装依赖

```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install torch torchvision torchaudio
pip install onnx onnxruntime
pip install numpy pandas
pip install scikit-learn
```

## 步骤 3：训练脚本

创建 `train_chapter_classifier.py`：

```python
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from sklearn.model_selection import train_test_split
import onnx
from onnxruntime import InferenceSession

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
        
        return torch.LongTensor(tokens), torch.tensor(label, dtype=torch.float32)

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
            labels = labels.long().to(device)
            
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
                labels = labels.long().to(device)
                
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
    training_data_path = 'training_data.json'  # 从 TypeScript 导出的训练数据
    output_model_path = 'chapter_classifier.onnx'
    epochs = 20
    batch_size = 32
    learning_rate = 0.001
    
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
    print("=" * 50)

if __name__ == '__main__':
    main()
```

## 步骤 4：运行训练

```bash
# 1. 准备训练数据（在浏览器中运行 TypeScript 代码，导出 JSON）
# 2. 将 training_data.json 放到 Python 项目目录
# 3. 运行训练脚本

python train_chapter_classifier.py
```

## 步骤 5：部署模型

训练完成后，将生成的 `chapter_classifier.onnx` 文件放到：

```
public/models/chapter_classifier.onnx
```

## 步骤 6：测试模型

在浏览器中测试：

```typescript
import { EnhancedAIChapterExtractor } from '@/lib/enhancedAIChapterExtractor';

const extractor = new EnhancedAIChapterExtractor({
  modelPath: '/weread/models/chapter_classifier.onnx',
  threshold: 0.7,
});

await extractor.initialize();
const chapters = await extractor.extractChapters(text);
console.log('Extracted chapters:', chapters);
```

## 高级技巧

### 1. 数据增强

```python
def augment_data(samples):
    """数据增强：添加噪声、同义词替换等"""
    augmented = []
    for sample in samples:
        augmented.append(sample)
        # 添加轻微变体
        if sample['isChapter']:
            # 例如：添加空格变体
            text = sample['text']
            if ' ' not in text:
                augmented.append({
                    **sample,
                    'text': f' {text} '  # 添加空格
                })
    return augmented
```

### 2. 模型优化

```python
# 量化模型（减小文件大小）
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    'chapter_classifier.onnx',
    'chapter_classifier_quantized.onnx',
    weight_type=QuantType.QUInt8
)
```

### 3. 持续训练

```python
# 加载已有模型继续训练
checkpoint = torch.load('chapter_classifier.pth')
model.load_state_dict(checkpoint)
# 继续训练...
```

## 训练数据收集建议

1. **多样化数据**：收集不同格式的书籍（中文、英文、不同章节格式）
2. **平衡样本**：正负样本比例建议 1:2 到 1:3
3. **质量优先**：确保标注准确，宁可少而精
4. **持续收集**：从用户反馈中收集新的训练样本

## 性能优化

- **模型大小**：使用量化减小模型文件
- **推理速度**：使用更小的 hidden_dim 或更少的 LSTM 层
- **准确率**：增加训练数据，调整模型架构

## 故障排除

### 问题 1：模型文件太大

**解决方案**：使用量化
```python
quantize_dynamic('model.onnx', 'model_quantized.onnx')
```

### 问题 2：准确率不高

**解决方案**：
- 增加训练数据
- 调整模型参数（hidden_dim, num_layers）
- 增加训练轮数

### 问题 3：浏览器中加载失败

**解决方案**：
- 检查模型路径
- 确认 ONNX 版本兼容
- 检查 CORS 设置

## 完整示例项目结构

```
weread/
├── lib/
│   ├── onnxModelTrainer.ts      # 训练数据生成
│   └── enhancedAIChapterExtractor.ts
├── public/
│   └── models/
│       └── chapter_classifier.onnx  # 训练好的模型
├── training/                      # Python 训练脚本（新建）
│   ├── train_chapter_classifier.py
│   └── training_data.json        # 从 TypeScript 导出
└── docs/
    └── ONNX_MODEL_TRAINING.md   # 本文档
```

## 下一步

1. 收集更多训练数据
2. 训练模型
3. 评估效果
4. 持续改进

祝你训练顺利！🎉
