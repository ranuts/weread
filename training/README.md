# 章节分类模型训练

## 快速开始

### 1. 安装依赖

```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 准备训练数据

在浏览器中使用 TypeScript 生成训练数据：

```typescript
import { ONNXModelTrainer } from '@/lib/onnxModelTrainer';

const trainingData = ONNXModelTrainer.generateTrainingData(
  bookText,
  knownChapters,
  { includeContext: true, balanceSamples: true }
);

const json = ONNXModelTrainer.exportTrainingData(trainingData);
// 保存为 training_data.json
```

将 `training_data.json` 放到 `training/` 目录。

### 3. 训练模型

```bash
python train_chapter_classifier.py
```

### 4. 部署模型

训练完成后，将 `chapter_classifier.onnx` 复制到：

```
../public/models/chapter_classifier.onnx
```

## 配置说明

可以在 `train_chapter_classifier.py` 中调整：

- `epochs`: 训练轮数（默认 20）
- `batch_size`: 批次大小（默认 32）
- `learning_rate`: 学习率（默认 0.001）
- `vocab_size`: 词汇表大小（默认 20000）
- `max_length`: 最大序列长度（默认 256）

## 模型架构

- **Embedding**: 128 维
- **LSTM**: 双向，2 层，256 隐藏单元
- **Dropout**: 0.3
- **输出**: 2 类（章节/非章节）

## 性能优化

### 量化模型（减小文件大小）

```python
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    'chapter_classifier.onnx',
    'chapter_classifier_quantized.onnx',
    weight_type=QuantType.QUInt8
)
```

## 故障排除

### 内存不足

减小 `batch_size` 或 `max_length`

### 训练速度慢

使用 GPU：
```bash
# 检查 CUDA 是否可用
python -c "import torch; print(torch.cuda.is_available())"
```

### 准确率不高

- 增加训练数据
- 增加训练轮数
- 调整模型参数
