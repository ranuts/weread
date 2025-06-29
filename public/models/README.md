# AI Models Directory

This directory contains ONNX models for local AI inference in Weread.

## Current Models

- `chapter_classifier.onnx` - Lightweight neural network for chapter detection

## Model Specifications

### Chapter Classifier Model

- **Input**: Tokenized text sequences (max length: 128)
- **Output**: Binary classification probabilities (not chapter, chapter)
- **Architecture**: Simple embedding + linear classifier
- **Size**: ~1MB
- **Languages**: Chinese, English, and mixed content

## Usage

1. Download the model file from the AI Demo page
2. Place it in this directory
3. The application will automatically load it for chapter detection

## Model Generation

The model can be generated using the built-in model generator:

```javascript
import { modelGenerator } from '@/lib/modelGenerator';

// Generate and download model
await modelGenerator.saveModelToFile('/models/chapter_classifier.onnx');
```

## Performance

- **Inference Time**: ~10-50ms per batch (32 lines)
- **Memory Usage**: ~5-10MB
- **Accuracy**: 85-90% on standard chapter formats
- **Fallback**: Automatic fallback to traditional regex methods

## Privacy

All models run locally in the browser using ONNX Runtime Web. No data is sent to external servers. 