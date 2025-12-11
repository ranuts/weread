import React, { useState } from 'react';
import { ONNXModelTrainer } from '@/lib/onnxModelTrainer';
import type { TrainingData } from '@/lib/onnxModelTrainer';

const TrainingDataGenerator: React.FC = () => {
  const [bookText, setBookText] = useState('');
  const [knownChapters, setKnownChapters] = useState('');
  const [trainingData, setTrainingData] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = () => {
    if (!bookText.trim()) {
      alert('请输入书籍文本');
      return;
    }

    setLoading(true);
    try {
      // 解析已知章节（每行一个）
      const chapters = knownChapters
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // 生成训练数据
      const data = ONNXModelTrainer.generateTrainingData(bookText, chapters, {
        includeContext: true,
        balanceSamples: true,
      });

      setTrainingData(data);
      console.log('Training data generated:', data);
    } catch (error) {
      console.error('Failed to generate training data:', error);
      alert('生成训练数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!trainingData) {
      alert('请先生成训练数据');
      return;
    }

    const json = ONNXModelTrainer.exportTrainingData(trainingData);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'training_data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>训练数据生成器</h1>
      <p>用于生成 ONNX 模型训练数据</p>

      <div style={{ marginBottom: '20px' }}>
        <h2>1. 输入书籍文本</h2>
        <textarea
          value={bookText}
          onChange={(e) => setBookText(e.target.value)}
          placeholder="粘贴书籍的完整文本..."
          style={{
            width: '100%',
            height: '200px',
            padding: '10px',
            fontSize: '14px',
            fontFamily: 'monospace',
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>2. 输入已知章节标题（每行一个）</h2>
        <textarea
          value={knownChapters}
          onChange={(e) => setKnownChapters(e.target.value)}
          placeholder="一&#10;二&#10;三&#10;第一章&#10;第二章"
          style={{
            width: '100%',
            height: '150px',
            padding: '10px',
            fontSize: '14px',
            fontFamily: 'monospace',
          }}
        />
        <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
          提示：每行一个章节标题，例如：一、二、三、第一章、第二章等
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '生成中...' : '生成训练数据'}
        </button>
      </div>

      {trainingData && (
        <div style={{ marginBottom: '20px' }}>
          <h2>3. 训练数据统计</h2>
          <div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '4px' }}>
            <p>
              <strong>总样本数：</strong>
              {trainingData.metadata.totalSamples}
            </p>
            <p>
              <strong>正样本（章节）：</strong>
              {trainingData.metadata.positiveSamples}
            </p>
            <p>
              <strong>负样本（非章节）：</strong>
              {trainingData.metadata.negativeSamples}
            </p>
            <p>
              <strong>语言：</strong>
              {trainingData.metadata.languages.join(', ')}
            </p>
          </div>

          <button
            onClick={handleExport}
            style={{
              marginTop: '10px',
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            导出为 JSON
          </button>
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#e7f3ff', borderRadius: '4px' }}>
        <h2>下一步：训练模型</h2>
        <ol>
          <li>导出训练数据为 JSON 文件</li>
          <li>将 JSON 文件放到 <code>training/</code> 目录</li>
          <li>运行 Python 训练脚本：
            <pre style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
{`cd training
python train_chapter_classifier.py`}
            </pre>
          </li>
          <li>将生成的 <code>chapter_classifier.onnx</code> 复制到 <code>public/models/</code></li>
        </ol>
        <p>
          详细说明请查看：<code>docs/ONNX_MODEL_TRAINING.md</code>
        </p>
      </div>
    </div>
  );
};

export default TrainingDataGenerator;
