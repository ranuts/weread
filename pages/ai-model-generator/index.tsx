import React, { useEffect, useState } from 'react';
import { TFJSChapterExtractor } from '@/lib/tfjsChapterExtractor';
import { TFJSModelTrainer, type TrainingProgress } from '@/lib/tfjsModelTrainer';
import type { ChapterItem } from '@/lib/transformText';
import './index.scss';

const AIModelGenerator: React.FC = () => {
  const [text, setText] = useState('');
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [extractor, setExtractor] = useState<TFJSChapterExtractor | null>(null);
  const [trainer, setTrainer] = useState<TFJSModelTrainer | null>(null);
  const [trainingProgress, setTrainingProgress] = useState<{
    isTraining: boolean;
    currentBook: string;
    processedBooks: number;
    totalBooks: number;
    currentEpoch: number;
    totalEpochs: number;
    loss: number;
    accuracy: number;
    stats: { totalSamples: number; positiveSamples: number; negativeSamples: number; books: string[] } | null;
  }>({
    isTraining: false,
    currentBook: '',
    processedBooks: 0,
    totalBooks: 5,
    currentEpoch: 0,
    totalEpochs: 10,
    loss: 0,
    accuracy: 0,
    stats: null
  });

  useEffect(() => {
    initializeExtractor();
    initializeTrainer();
    return () => {
      if (extractor) {
        extractor.dispose();
      }
      if (trainer) {
        trainer.dispose();
      }
    };
  }, []);

  const initializeExtractor = async () => {
    setModelStatus('loading');
    try {
      const newExtractor = new TFJSChapterExtractor({
        modelPath: '/weread/models/chapter_classifier.json',
        threshold: 0.7,
        maxLength: 128,
        batchSize: 32,
        vocabSize: 1000,
      });
      await newExtractor.initialize();
      setExtractor(newExtractor);
      setModelStatus('ready');
    } catch (error) {
      console.error('Failed to initialize extractor:', error);
      setModelStatus('error');
    }
  };

  const initializeTrainer = () => {
    const newTrainer = new TFJSModelTrainer({
      epochs: 10,
      batchSize: 32,
      learningRate: 0.001,
      validationSplit: 0.2,
      maxLength: 128,
      vocabSize: 1000,
    });
    setTrainer(newTrainer);
  };

  const handleExtractChapters = async () => {
    if (!text.trim() || !extractor) return;
    setLoading(true);
    try {
      const extractedChapters = await extractor.extractChapters(text);
      // 转换 ChapterInfo 到 ChapterItem 格式
      const chapterItems: ChapterItem[] = extractedChapters.map(chapter => ({
        title: chapter.title,
        start: chapter.startIndex,
        end: chapter.endIndex,
        confidence: chapter.confidence,
      }));
      setChapters(chapterItems);
    } catch (error) {
      console.error('Chapter extraction failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateModel = async () => {
    if (!trainer) return;
    
    try {
      setTrainingProgress(prev => ({ 
        ...prev, 
        isTraining: true, 
        currentBook: '正在生成训练数据...',
        currentEpoch: 0,
        loss: 0,
        accuracy: 0
      }));
      
      // 生成训练数据
      const trainingData = await trainer.generateTrainingData();
      
      setTrainingProgress(prev => ({
        ...prev,
        currentBook: '正在训练模型...',
        stats: {
          totalSamples: trainingData.length,
          positiveSamples: trainingData.filter(d => d.isChapter).length,
          negativeSamples: trainingData.filter(d => !d.isChapter).length,
          books: ['camelXiangzi', 'JaneEyre', 'shakespeare', 'walden', 'theThreeKingdoms']
        }
      }));

      // 训练模型
      await trainer.trainModel(trainingData, (progress: TrainingProgress) => {
        setTrainingProgress(prev => ({
          ...prev,
          currentEpoch: progress.epoch,
          loss: progress.loss,
          accuracy: progress.accuracy
        }));
      });

      // 保存模型
      await trainer.saveModel('chapter_classifier');
      
      setTrainingProgress(prev => ({
        ...prev,
        isTraining: false,
        currentBook: '训练完成！'
      }));
      
      alert('模型训练完成并已下载！请将下载的模型文件放到 public/models/ 目录下，然后刷新页面。');
      
      // 重新初始化提取器以加载新模型
      await initializeExtractor();
    } catch (error) {
      console.error('Model training failed:', error);
      setTrainingProgress(prev => ({ ...prev, isTraining: false }));
      alert('模型训练失败，请查看控制台错误信息。');
    }
  };

  const loadSampleText = () => {
    const sampleText = `第一章 引言\n\n这是一个示例文本，用于演示 AI 章节识别功能。\n\n第二章 背景\n\n在这一章中，我们将讨论项目的背景和历史。\n\n第三章 方法\n\n本章将详细介绍我们使用的方法和技术。\n\n第四章 结果\n\n最后，我们将展示实验结果和分析。\n\n第五章 结论\n\n总结全文，提出未来的研究方向。`;
    setText(sampleText);
  };

  const getModelStatusText = () => {
    switch (modelStatus) {
      case 'idle':
        return '未初始化';
      case 'loading':
        return '加载中...';
      case 'ready':
        return '已就绪';
      case 'error':
        return '加载失败';
      default:
        return '未知状态';
    }
  };

  const getModelStatusColor = () => {
    switch (modelStatus) {
      case 'ready':
        return 'text-green-600';
      case 'loading':
        return 'text-yellow-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="ai-model-generator">
      <div className="generator-header">
        <h1>AI 模型生成器</h1>
        <p>基于本地书籍训练并生成 AI 章节识别模型</p>
      </div>
      
      <div className="generator-controls">
        <div className="control-group">
          <div className="model-status">
            模型状态：<span className={getModelStatusColor()}>{getModelStatusText()}</span>
          </div>
        </div>
        <div className="control-group">
          <button 
            onClick={handleGenerateModel} 
            className="btn btn-secondary"
            disabled={trainingProgress.isTraining}
          >
            {trainingProgress.isTraining ? '训练中...' : '生成模型文件'}
          </button>
          <button onClick={loadSampleText} className="btn btn-secondary">
            加载示例文本
          </button>
        </div>
      </div>

      {/* 训练进度显示 */}
      {trainingProgress.isTraining && (
        <div className="training-progress">
          <h3>训练进度</h3>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(trainingProgress.currentEpoch / trainingProgress.totalEpochs) * 100}%` }}
            ></div>
          </div>
          <div className="progress-info">
            <span>{trainingProgress.currentBook}</span>
            <span>Epoch: {trainingProgress.currentEpoch} / {trainingProgress.totalEpochs}</span>
          </div>
          {trainingProgress.loss > 0 && (
            <div className="training-metrics">
              <div className="metric">
                <span className="metric-label">Loss:</span>
                <span className="metric-value">{trainingProgress.loss.toFixed(4)}</span>
              </div>
              <div className="metric">
                <span className="metric-label">Accuracy:</span>
                <span className="metric-value">{(trainingProgress.accuracy * 100).toFixed(2)}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 训练统计信息 */}
      {trainingProgress.stats && (
        <div className="training-stats">
          <h3>训练统计</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{trainingProgress.stats.totalSamples}</div>
              <div className="stat-label">总样本数</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{trainingProgress.stats.positiveSamples}</div>
              <div className="stat-label">章节样本</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{trainingProgress.stats.negativeSamples}</div>
              <div className="stat-label">非章节样本</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{trainingProgress.stats.books.length}</div>
              <div className="stat-label">训练书籍</div>
            </div>
          </div>
          <div className="books-list">
            <strong>训练书籍：</strong>
            {trainingProgress.stats.books.join(', ')}
          </div>
        </div>
      )}

      <div className="generator-content">
        <div className="input-section">
          <h3>输入文本</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="请输入要分析的文本内容..."
            rows={15}
          />
          <button
            onClick={handleExtractChapters}
            disabled={!text.trim() || loading || modelStatus !== 'ready'}
            className="btn btn-primary"
          >
            {loading ? '识别中...' : '开始识别'}
          </button>
        </div>
        <div className="output-section">
          <h3>识别结果</h3>
          {chapters.length > 0 ? (
            <div className="chapters-list">
              {chapters.map((chapter, index) => (
                <div key={index} className="chapter-item">
                  <div className="chapter-title">
                    {chapter.title}
                    {chapter.confidence && (
                      <span className="confidence">置信度：{(chapter.confidence * 100).toFixed(1)}%</span>
                    )}
                  </div>
                  <div className="chapter-info">
                    位置：{chapter.start} - {chapter.end || '未知'}
                    {chapter.pageNum && ` | 页码：${chapter.pageNum}`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-results">{loading ? '正在识别章节...' : '暂无识别结果'}</div>
          )}
        </div>
      </div>
      
      <div className="generator-info">
        <h3>功能说明</h3>
        <ul>
          <li>
            <strong>Web 端训练：</strong> 使用 TensorFlow.js 在浏览器中直接训练模型
          </li>
          <li>
            <strong>本地数据：</strong> 基于项目中的中英文书籍进行训练
          </li>
          <li>
            <strong>智能识别：</strong> 使用训练好的模型进行章节识别
          </li>
          <li>
            <strong>置信度评分：</strong> 为每个识别的章节提供置信度评分
          </li>
          <li>
            <strong>自动回退：</strong> 当 AI 模型不可用时，自动使用启发式方法
          </li>
        </ul>
        <h3>使用步骤</h3>
        <ol>
          <li>点击"生成模型文件"开始训练和生成模型</li>
          <li>等待训练完成，模型文件会自动下载</li>
          <li>
            将下载的模型文件放到 <code>public/models/chapter_classifier.json</code>
          </li>
          <li>刷新页面，等待模型加载完成</li>
          <li>输入文本并点击"开始识别"</li>
        </ol>
        <h3>技术特点</h3>
        <ul>
          <li><strong>TensorFlow.js：</strong> 完全在浏览器中运行，无需后端服务器</li>
          <li><strong>实时训练：</strong> 可以实时查看训练进度和指标</li>
          <li><strong>模型保存：</strong> 训练完成后自动下载模型文件</li>
          <li><strong>内存管理：</strong> 自动清理 GPU 内存，避免内存泄漏</li>
        </ul>
      </div>
    </div>
  );
};

export default AIModelGenerator;
