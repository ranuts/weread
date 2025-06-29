// 基于本地书籍的章节分类模型生成器
export class ChapterModelGenerator {
  private static instance: ChapterModelGenerator;
  private modelData: ArrayBuffer | null = null;
  private trainingData: { text: string; isChapter: boolean }[] = [];

  static getInstance(): ChapterModelGenerator {
    if (!ChapterModelGenerator.instance) {
      ChapterModelGenerator.instance = new ChapterModelGenerator();
    }
    return ChapterModelGenerator.instance;
  }

  // 从本地书籍生成训练数据
  async generateTrainingData(): Promise<void> {
    console.log('开始生成训练数据...');
    
    // 定义书籍列表和预定义的章节
    const books = [
      { 
        name: 'camelXiangzi', 
        path: '/weread/assets/books/camelXiangzi/camelXiangzi.txt', 
        language: 'chinese',
        chapters: [
          '一',
          '二',
          '三',
          '四',
          '五',
          '六',
          '七',
          '八',
          '九',
          '十',
          '十一',
          '十二',
          '十三',
          '十四',
          '十五',
          '十六',
          '十七',
          '十八',
          '十九',
          '二十',
          '二十一',
          '二十二',
          '二十三',
          '二十四'
        ]
      },
      { 
        name: 'JaneEyre', 
        path: '/weread/assets/books/JaneEyre/JaneEyre.txt', 
        language: 'english',
        chapters: [
          'Chapter 1',
          'Chapter 2',
          'Chapter 3',
          'Chapter 4',
          'Chapter 5',
          'Chapter 6',
          'Chapter 7',
          'Chapter 8',
          'Chapter 9',
          'Chapter 10',
          'Chapter 11',
          'Chapter 12',
          'Chapter 13',
          'Chapter 14',
          'Chapter 15',
          'Chapter 16',
          'Chapter 17',
          'Chapter 18',
          'Chapter 19',
          'Chapter 20',
          'Chapter 21',
          'Chapter 22',
          'Chapter 23',
          'Chapter 24',
          'Chapter 25',
          'Chapter 26',
          'Chapter 27',
          'Chapter 28',
          'Chapter 29',
          'Chapter 30',
          'Chapter 31',
          'Chapter 32',
          'Chapter 33',
          'Chapter 34',
          'Chapter 35',
          'Chapter 36',
          'Chapter 37',
          'Chapter 38'
        ]
      },
      { 
        name: 'shakespeare', 
        path: '/weread/assets/books/shakespeare/shakespeare.txt', 
        language: 'english',
        chapters: [
          'ACT I',
          'ACT II',
          'ACT III',
          'ACT IV',
          'ACT V',
          'SCENE I',
          'SCENE II',
          'SCENE III',
          'SCENE IV',
          'SCENE V'
        ]
      },
      { 
        name: 'walden', 
        path: '/weread/assets/books/walden/walden.txt', 
        language: 'english',
        chapters: [
          'ECONOMY',
          'READING',
          'SOUNDS',
          'SOLITUDE',
          'VISITORS',
          'VILLAGE',
          'PONDS',
          'SPRING',
          'CONCLUSION'
        ]
      },
      { 
        name: 'theThreeKingdoms', 
        path: '/weread/assets/books/theThreeKingdoms/theThreeKingdoms.txt', 
        language: 'chinese',
        chapters: [
          '第 1 章 宴桃园豪杰三结义 斩黄巾英雄首立功',
          '第 2 章 张翼德怒鞭督邮 何国舅谋诛宦竖',
          '第 3 章 议温明董卓叱丁原 馈金珠李肃说吕布',
          '第 4 章 废汉帝陈留践位 谋董贼孟德献刀',
          '第 5 章 发矫诏诸镇应曹公 破关兵三英战吕布',
          '第 6 章 焚金阙董卓行凶 匿玉玺孙坚背约',
          '第 7 章 袁绍磐河战公孙 孙坚跨江击刘表',
          '第 8 章 王司徒巧使连环计 董太师大闹凤仪亭',
          '第 9 章 除暴凶吕布助司徒 犯长安李傕听贾诩',
          '第 10 章 勤王室马腾举义 报父仇曹操兴师',
          '第 11 章 刘皇叔北海救孔融 吕温侯濮阳破曹操',
          '第 12 章 陶恭祖三让徐州 曹孟穗大战吕布',
          '第 13 章 李傕郭汜大交兵 杨奉董承双救驾',
          '第 14 章 曹孟德移驾幸许都 吕奉先乘夜袭徐郡',
          '第 15 章 太史慈酣斗小霸王 孙伯符大战严白虎',
          '第 16 章 吕奉先射戟辕门 曹孟德败师淯水',
          '第 17 章 袁公路大起七军 曹孟德会合三将',
          '第 18 章 贾文和料敌决胜 夏侯惇拨矢啖睛',
          '第 19 章 下邳城曹操鏖兵 白门楼吕布殒命',
          '第 20 章 曹阿瞒许田打围 董国舅内阁受诏',
          '第 21 章 曹操煮酒论英雄 关公赚城斩车胄',
          '第 22 章 袁曹各起马步三军 关张共擒王刘二将',
          '第 23 章 祢正平裸衣骂贼 吉太医下毒遭刑',
          '第 24 章 国贼行凶杀贵妃 皇叔败走投袁绍',
          '第 25 章 屯土山关公约三事 救白马曹操解重围',
          '第 26 章 袁本初败兵折将 关云长挂印封金',
          '第 27 章 美髯公千里走单骑 汉寿侯五关斩六将',
          '第 28 章 斩蔡阳兄弟释疑 会古城主臣聚义',
          '第 29 章 小霸王怒斩于吉 碧眼儿坐领江东',
          '第 30 章 战官渡本初败绩 劫乌巢孟德烧粮',
          '第 31 章 曹操仓亭破本初 玄德荆州依刘表',
          '第 32 章 夺冀州袁尚争锋 决漳河许攸献计',
          '第 33 章 曹丕乘乱纳甄氏 郭嘉遗计定辽东',
          '第 34 章 蔡夫人隔屏听密语 刘皇叔跃马过檀溪',
          '第 35 章 玄德南漳逢隐沧 单福新野遇英主',
          '第 36 章 玄德用计袭樊城 元直走马荐诸葛',
          '第 37 章 司马徽再荐名士 刘玄德三顾草庐',
          '第 38 章 定三分隆中决策 战长江孙氏报仇',
          '第 39 章 荆州城公子三求计 博望坡军师初用兵',
          '第 40 章 蔡夫人议献荆州 诸葛亮火烧新野',
          '第 41 章 刘玄德携民渡江 赵子龙单骑救主',
          '第 42 章 张翼德大闹长坂桥 刘豫州败走汉津口',
          '第 43 章 诸葛亮舌战群儒 鲁子敬力排众议',
          '第 44 章 孔明用智激周瑜 孙权决计破曹操',
          '第 45 章 三江口曹操折兵 群英会蒋干中计',
          '第 46 章 用奇谋孔明借箭 献密计黄盖受刑',
          '第 47 章 阚泽密献诈降书 庞统巧授连环计',
          '第 48 章 宴长江曹操赋诗 锁战船北军用武',
          '第 49 章 七星坛诸葛祭风 三江口周瑜纵火',
          '第 50 章 诸葛亮智算华容 关云长义释曹操',
          '第 51 章 曹仁大战东吴兵 孔明一气周公瑾',
          '第 52 章 诸葛亮智辞鲁肃 赵子龙计取桂阳',
          '第 53 章 关云长义释黄汉升 孙仲谋大战张文远',
          '第 54 章 吴国太佛寺看新郎 刘皇叔洞房续佳偶',
          '第 55 章 玄德智激孙夫人 孔明二气周公瑾',
          '第 56 章 曹操大宴铜雀台 孔明三气周公瑾',
          '第 57 章 柴桑口卧龙吊丧 耒阳县凤雏理事',
          '第 58 章 马孟起兴兵雪恨 曹阿瞒割须弃袍',
          '第 59 章 许诸裸衣斗马超 曹操抹书问韩遂',
          '第 60 章 张永年反难杨修 庞士元议取西蜀',
          '第 61 章 赵云截江夺阿斗 孙权遗书退老瞒',
          '第 62 章 取涪关杨高授首 攻雒城黄魏争功',
          '第 63 章 诸葛亮痛哭庞统 张翼德义释严颜',
          '第 64 章 孔明定计捉张任 杨阜借兵破马超',
          '第 65 章 马超大战葭萌关 刘备自领益州牧',
          '第 66 章 关云长单刀赴会 伏皇后为国捐生',
          '第 67 章 曹操平定汉中地 张辽威震逍遥津',
          '第 68 章 甘宁百骑劫魏营 左慈掷杯戏曹操',
          '第 69 章 卜周易管辂知机 讨汉贼五臣死节',
          '第 70 章 猛张飞智取瓦口隘 老黄忠计夺天荡山',
          '第 71 章 占对山黄忠逸待劳 据汉水赵云寡胜众',
          '第 72 章 诸葛亮智取汉中 曹阿瞒兵退斜谷',
          '第 73 章 玄德进位汉中王 云长攻拔襄阳郡',
          '第 74 章 庞令明抬榇决死战 关云长放水淹七军',
          '第 75 章 关云长刮骨疗毒 吕子明白衣渡江',
          '第 76 章 徐公明大战沔水 关云长败走麦城',
          '第 77 章 玉泉山关公显圣 洛阳城曹操感神',
          '第 78 章 治风疾神医身死 传遗命奸雄数终',
          '第 79 章 兄逼弟曹植赋诗 侄陷叔刘封伏法',
          '第 80 章 曹丕废帝篡炎刘 汉王正位续大统',
          '第 81 章 急兄仇张飞遇害 雪弟恨先主兴兵',
          '第 82 章 孙权降魏受九锡 先主征吴赏六军',
          '第 83 章 战猇亭先主得仇人 守江口书生拜大将',
          '第 84 章 陆逊营烧七百里 孔明巧布八阵图',
          '第 85 章 刘先主遗诏托孤儿 诸葛亮安居平五路',
          '第 86 章 难张温秦宓逞天辩 破曹丕徐盛用火攻',
          '第 87 章 征南寇丞相大兴师 抗天兵蛮王初受执',
          '第 88 章 渡泸水再缚番王 识诈降三擒孟获',
          '第 89 章 武乡侯四番用计 南蛮王五次遭擒',
          '第 90 章 驱巨善六破蛮兵 烧藤甲七擒孟获',
          '第 91 章 祭泸水汉相班师 伐中原武侯上表',
          '第 92 章 赵子龙力斩五将 诸葛亮智取三城',
          '第 93 章 姜伯约归降孔明 武乡侯骂死王朝',
          '第 94 章 诸葛亮乘雪破羌兵 司马懿克日擒孟达',
          '第 95 章 马谡拒谏失街亭 武侯弹琴退仲达',
          '第 96 章 孔明挥泪斩马谡 周鲂断发赚曹休',
          '第 97 章 讨魏国武侯再上表 破曹兵姜维诈献书',
          '第 98 章 追汉军王双受诛 袭陈仓武侯取胜',
          '第 99 章 诸葛亮大破魏兵 司马懿入寇西蜀',
          '第 100 章 汉兵劫寨破曹真 武侯斗阵辱仲达'
        ]
      },
      { 
        name: 'princekin', 
        path: '/weread/assets/books/princekin/princekin.txt', 
        language: 'chinese',
        chapters: [
          'I',
          'II',
          'III',
          'IV',
          'V',
          'VI',
          'VII',
          'VIII',
          'IX',
          'X',
          'XI',
          'XII',
          'XIII',
          'XIV',
          'XV',
          'XVI',
          'XVII',
          'XVIII',
          'XIX',
          'XX',
          'XXI',
          'XXII',
          'XXIII',
          'XXIV',
          'XXV',
          'XXVI',
          'XXVII'
        ]
      },
      { 
        name: 'snowWhite', 
        path: '/weread/assets/books/snowWhite/snowWhite.txt', 
        language: 'chinese',
        chapters: [
          '第一章 白雪公主',
          '第二章 七个小矮人',
          '第三章 王子的吻',
          '第四章 幸福的生活'
        ]
      },
      { 
        name: 'theWealthOfNations', 
        path: '/weread/assets/books/theWealthOfNations/theWealthOfNations.txt', 
        language: 'chinese',
        chapters: [
          '第一篇 论劳动生产力增进的原因，',
          '第一章  论分工',
          '第二章  论分工的原由',
          '第三章 论分工受市场范围的限制',
          '第四章 论货币的起源及其效用',
          '第五章 论商品的真实价格与名义价格或其劳动价格与货币价格',
          '第六章  论商品价格的组成部分',
          '第七章 论商品的自然价格与市场价格',
          '第八章 论劳动工资劳动生产物构成劳动的自然报酬或自然工资。',
          '第九章 论资本利润',
          '第十章 论工资与利润随劳动与资本用途的不同而不同',
          '第十一章 论地租',
          '第一节 论总能提供地租的土地生产物',
          '第二节论有时提供有时不提供地租的土地生产物',
          '第三节论总能提供地租的生产物与有时提供有时不提供地租的生产物',
          '第二篇  论资财的性质及其蓄积和用途',
          '第一章 论资财的划分',
          '第二章 论作为社会总资财的一部门或作为维持国民资本的费用的货币',
          '第三章  论资本积累并论生产性和非生产性劳动',
          '第四章 论贷出取息的资财',
          '第五章  论资本的各种用途',
          '第三篇 论不同国家中财富的不同发展',
          '第一章 论财富的自然的发展',
          '第二章 论罗马帝国崩溃后农业在欧洲旧状态下所受到的阻抑',
          '第三章 论罗马帝国崩溃后都市的勃兴与进步',
          '第四章 都市商业对农村改良的贡献',
          '第四篇 论政治经济学体系',
          '第一章  商业主义或重商主义的原理',
          '第二章 论限制从外国输入国内能生产的货物',
          '第三章 论对其贸易的差额被认为不利于我国的那些国家的各种货物的输入所加的异常限制',
          '第四章 论退税',
          '第五章 论奖励金',
          '第六章 论通商条约',
          '第七章 论殖民地',
          '第一节论建立新殖民地的动机',
          '第八章 关于重商主义的结论',
          '第九章 论重农主义即政治经济学中把土地生产物看作各国收入及财富的唯一来源或主要来源的学说',
          '第五篇 论君主或国家的收人',
          '第一章 论君主或国家的费用',
          '第一节 论国防费',
          '第二节 论司法经费',
          '第三节 论公共工程和公共机关的费用',
          '第二章 论一般收入或公共收入的源泉',
          '第一节 特别属于君主或国家的收入源泉',
          '第二节 论赋税',
          '第三章 论公债'
        ]
      },
      { 
        name: 'TheHunchbackofNotre-Dame', 
        path: '/weread/assets/books/TheHunchbackofNotre-Dame/TheHunchbackofNotre-Dame.txt', 
        language: 'english',
        chapters: [
          'BOOK I',
          'Chapter 1 - The Great Hall',
          'Chapter 2 - Pierre Gringoire',
          'Chapter 3 - The Cardinal',
          'Chapter 4 - Master Jacques Coppenole',
          'Chapter 5 - Quasimodo',
          'Chapter 6 - Esmeralda',
          'BOOK II',
          'Chapter 1 - From Scylla to Charybdis',
          'Chapter 2 - The Place De Grève',
          'Chapter 3 - Besos Para Golpes',
          'Chapter 4 - The Mishaps Consequent on Following a Pretty Woman Through the Streets at Night',
          'Chapter 5 - Sequel of the Mishap',
          'Chapter 6 - The Broken Pitcher',
          'Chapter 7 - A Wedding-Night',
          'BOOK III',
          'Chapter 1 - Notre-Dame',
          'Chapter 2 - A Bird\'s-eye View of Paris',
          'BOOK IV',
          'Chapter 1 - Charitable Souls',
          'Chapter 2 - Claude Frollo',
          'Chapter 3 - Immanis Pecoris Custos, Immanior IPSE',
          'Chapter 4 - The Dog and his Master',
          'Chapter 5 - Further Particulars of Claude Frollo',
          'Chapter 6 - Unpopularity',
          'BOOK V',
          'Chapter 1 - The Abbot of Saint-Martin\'s',
          'Chapter 2 - This Will Destroy That',
          'BOOK VI',
          'Chapter 1 - An Impartial Glance at the Ancient Magistracy',
          'Chapter 2 - The Rat-hole',
          'Chapter 3 - The Story of a Wheaten Cake',
          'Chapter 4 - A Tear for a Drop of Water',
          'Chapter 5 - The end of the Wheaten Cake',
          'BOOK VII',
          'Chapter 1 - Showing the danger of Confiding one\'s Secret to a Goat',
          'Chapter 2 - Showing that A Priest and A Philosopher are not the same',
          'Chapter 3 - The Bells',
          'Chapter 4 - Fate',
          'Chapter 5 - The Two Men in Black',
          'Chapter 6 - Of the Result of Launching a String of Seven Oaths in a Public Square',
          'Chapter 7 - The Spectre-Monk',
          'Chapter 8 - The Convenience of Windows Overlooking the River',
          'BOOK VIII',
          'Chapter 1 - The Crown Piece changed into A Withered Leaf',
          'Chapter 2 - Sequel to the Crown Piece changed into A Withered Leaf',
          'Chapter 3 - End of the Crown Piece changed into A Withered Leaf',
          'Chapter 4 - Lasciate Ogni Speranza',
          'Chapter 5 - The Mother',
          'Chapter 6 - Three Various Hearts of Men',
          'BOOK IX',
          'Chapter 1 - Delirium',
          'Chapter 2 - Humpbacked, One-eyed, Lame',
          'Chapter 3 - Deaf',
          'Chapter 4 - Earthenware and Crystal',
          'Chapter 5 - The Key of the Porte Rouge',
          'Chapter 6 - Sequel to the key of the Porte Rouge',
          'BOOK X',
          'Chapter 1 - Gringoire has several bright ideas in succession in the Rue des Bernardins',
          'Chapter 2 - Turn Vagabond',
          'Chapter 3 - Vive La Joie',
          'Chapter 4 - An Awkward Friend',
          'Chapter 5 - The Closet where Monsieur Louis of France Recites his Orisons',
          'Chapter 6 - The Pass-Word',
          'Chapter 7 - Chateaupers to The Rescue',
          'BOOK XI',
          'Chapter 1 - The Little Shoe',
          'Chapter 2 - La Creatura Bella Bianco Vestita. Dante',
          'Chapter 3 - The Marriage of Phœbus',
          'Chapter 4 - The Marriage of Quasimodo'
        ]
      }
    ];

    this.trainingData = [];

    for (const book of books) {
      try {
        console.log(`处理书籍：${book.name}`);
        const text = await this.fetchBookText(book.path);
        if (!text) {
          console.warn(`书籍 ${book.name} 内容为空，跳过`);
          continue;
        }
        
        // 使用预定义的章节列表
        const chapters = book.chapters || this.extractChaptersFromText(text, book.language);
        
        // 生成正样本（章节标题）
        for (const chapter of chapters) {
          this.trainingData.push({
            text: chapter,
            isChapter: true
          });
        }

        // 生成负样本（非章节文本）
        const nonChapterLines = this.extractNonChapterLines(text, chapters);
        for (const line of nonChapterLines.slice(0, chapters.length * 2)) { // 平衡正负样本
          this.trainingData.push({
            text: line,
            isChapter: false
          });
        }

        console.log(`书籍 ${book.name} 处理完成：${chapters.length} 个章节`);
      } catch (error) {
        console.warn(`处理书籍 ${book.name} 时出错:`, error);
      }
    }

    console.log(`训练数据生成完成：${this.trainingData.length} 个样本`);
  }

  // 获取书籍文本，处理编码
  private async fetchBookText(path: string): Promise<string> {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // 获取 ArrayBuffer 数据
      const arrayBuffer = await response.arrayBuffer();
      
      // 检测编码
      const encoding = this.detectEncoding(arrayBuffer);
      console.log(`书籍 ${path} 编码：${encoding}`);
      
      // 解码文本
      const decoder = new TextDecoder(encoding);
      return decoder.decode(arrayBuffer);
    } catch (error) {
      console.warn(`无法获取书籍 ${path}:`, error);
      return '';
    }
  }

  // 检测文本编码
  private detectEncoding(arrayBuffer: ArrayBuffer): string {
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // 检查 BOM
    if (uint8Array.length >= 3 && uint8Array[0] === 0xEF && uint8Array[1] === 0xBB && uint8Array[2] === 0xBF) {
      return 'utf-8';
    }
    if (uint8Array.length >= 2 && uint8Array[0] === 0xFF && uint8Array[1] === 0xFE) {
      return 'utf-16le';
    }
    if (uint8Array.length >= 2 && uint8Array[0] === 0xFE && uint8Array[1] === 0xFF) {
      return 'utf-16be';
    }
    
    // 简单的编码检测逻辑
    let hasChinese = false;
    
    for (let i = 0; i < Math.min(uint8Array.length, 1000); i++) {
      const byte = uint8Array[i];
      if (byte > 127) {
        // 检查是否是中文字符的字节范围
        if (byte >= 0x80) {
          hasChinese = true;
        }
      }
    }
    
    // 如果有中文字符，优先使用 GBK 或 UTF-8
    if (hasChinese) {
      try {
        // 尝试 UTF-8 解码
        const utf8Decoder = new TextDecoder('utf-8');
        const utf8Text = utf8Decoder.decode(uint8Array);
        // 检查解码结果是否包含乱码
        if (!utf8Text.includes('')) {
          return 'utf-8';
        }
      } catch (_e) {
        // UTF-8 解码失败
      }
      
      // 尝试 GBK 解码
      try {
        const gbkDecoder = new TextDecoder('gbk');
        const gbkText = gbkDecoder.decode(uint8Array);
        if (!gbkText.includes('')) {
          return 'gbk';
        }
      } catch (_e) {
        // GBK 解码失败
      }
    }
    
    // 默认使用 UTF-8
    return 'utf-8';
  }

  // 从文本中提取章节
  private extractChaptersFromText(text: string, language: string): string[] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const chapters: string[] = [];

    const patterns = language === 'chinese' ? [
      /^第 [一二三四五六七八九十百千万\d]+[章节卷部]/,
      /^[第\d]+章/,
      /^[第\d]+节/,
      /^[一二三四五六七八九十]+、/,
      /^[一二三四五六七八九十]+$/,
      /^第 [一二三四五六七八九十百千万\d]+回/,
    ] : [
      /^Chapter\s+\d+/i,
      /^[IVX]+\./,
      /^\d+\./,
      /^[A-Z][A-Z\s]+$/,
      /^Book\s+\d+/i,
      /^Part\s+\d+/i,
    ];

    for (const line of lines) {
      if (line.length < 3 || line.length > 200) continue;
      
      const isChapter = patterns.some(pattern => pattern.test(line));
      if (isChapter) {
        chapters.push(line);
      }
    }

    return chapters;
  }

  // 从文本中提取非章节行作为负样本
  private extractNonChapterLines(text: string, chapters: string[]): string[] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const nonChapterLines: string[] = [];
    
    for (const line of lines) {
      // 检查这行是否匹配任何预定义的章节
      const isChapter = chapters.some(chapter => 
        line.includes(chapter) || 
        line.toLowerCase().includes(chapter.toLowerCase())
      );
      
      // 如果不是章节，且长度合适（不要太短或太长），则作为负样本
      if (!isChapter && line.length > 5 && line.length < 200) {
        // 过滤掉一些明显不是正文的行
        if (!line.match(/^[0-9\s\-_=*]+$/) && // 不是纯数字或符号
            !line.match(/^[A-Z\s]+$/) && // 不是全大写字母
            !line.match(/^[a-z\s]+$/) && // 不是全小写字母
            !line.startsWith('http') && // 不是 URL
            !line.match(/^[^\w\s]+$/) && // 不是纯标点符号
            !line.match(/^第 [一二三四五六七八九十百千万]+[章节回]/) && // 不是中文章节格式
            !line.match(/^Chapter\s+\d+/i) && // 不是英文章节格式
            !line.match(/^Book\s+[IVX]+/i) && // 不是 Book 格式
            !line.match(/^ACT\s+[IVX]+/i) && // 不是 ACT 格式
            !line.match(/^SCENE\s+[IVX]+/i)) { // 不是 SCENE 格式
          nonChapterLines.push(line);
        }
      }
    }
    
    return nonChapterLines;
  }

  // 生成基于训练数据的模型
  async generateModel(): Promise<ArrayBuffer> {
    if (this.modelData) {
      return this.modelData;
    }

    // 如果没有训练数据，先生成
    if (this.trainingData.length === 0) {
      await this.generateTrainingData();
    }

    console.log('开始生成模型...');
    
    // 创建词汇表
    const vocab = this.buildVocabulary();
    console.log(`词汇表大小：${vocab.size}`);

    // 创建简单的线性分类器权重
    const inputSize = vocab.size;
    const outputSize = 2; // [非章节，章节]
    const weights = this.generateWeightsFromTrainingData(vocab);

    // 创建 ONNX 模型数据
    this.modelData = this.createONNXModel(inputSize, outputSize, weights, vocab);
    
    console.log('模型生成完成');
    return this.modelData;
  }

  // 构建词汇表
  private buildVocabulary(): Map<string, number> {
    const vocab = new Map<string, number>();
    const wordCount = new Map<string, number>();

    // 统计词频
    for (const sample of this.trainingData) {
      const words = this.tokenize(sample.text);
      for (const word of words) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    }

    // 选择最常见的词
    const sortedWords = Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10000); // 限制词汇表大小

    // 构建词汇表
    vocab.set('<PAD>', 0);
    vocab.set('<UNK>', 1);
    for (let i = 0; i < sortedWords.length; i++) {
      vocab.set(sortedWords[i][0], i + 2);
    }

    return vocab;
  }

  // 简单的分词
  private tokenize(text: string): string[] {
    // 中英文混合分词
    const tokens: string[] = [];
    
    // 按空格分割英文
    const englishParts = text.split(/\s+/);
    
    for (const part of englishParts) {
      if (/[\u4e00-\u9fff]/.test(part)) {
        // 中文部分，按字符分割
        for (const char of part) {
          if (char.trim()) {
            tokens.push(char);
          }
        }
      } else {
        // 英文部分，按单词分割
        const words = part.toLowerCase().match(/[a-z]+/g) || [];
        tokens.push(...words);
      }
    }

    return tokens;
  }

  // 基于训练数据生成权重
  private generateWeightsFromTrainingData(vocab: Map<string, number>): Float32Array {
    const inputSize = vocab.size;
    const outputSize = 2;
    const weights = new Float32Array(inputSize * outputSize);

    // 初始化权重
    for (let i = 0; i < weights.length; i++) {
      weights[i] = (Math.random() - 0.5) * 0.1;
    }

    // 基于训练数据调整权重
    for (const sample of this.trainingData) {
      const tokens = this.tokenize(sample.text);
      const target = sample.isChapter ? 1 : 0;

      for (const token of tokens) {
        const tokenId = vocab.get(token) || vocab.get('<UNK>') || 1;
        if (tokenId < inputSize) {
          // 调整权重
          const weightIndex = tokenId * outputSize + target;
          weights[weightIndex] += 0.01;
        }
      }
    }

    return weights;
  }

  // 创建 ONNX 模型数据
  private createONNXModel(inputSize: number, outputSize: number, weights: Float32Array, vocab: Map<string, number>): ArrayBuffer {
    // 创建一个简化的 ONNX 模型表示
    // 在实际应用中，这里应该生成真正的 ONNX 格式
    
    const header = 'ONNX_MODEL_V2';
    const headerSize = header.length;
    
    // 计算所需的总大小，确保 4 字节对齐
    const metadataSize = 12; // 3 个 uint32
    const weightsSize = weights.length * 4; // Float32 每个 4 字节
    const vocabSizeSize = 4; // 1 个 uint32
    
    // 确保 header 后的偏移量是 4 的倍数
    const alignedHeaderSize = Math.ceil(headerSize / 4) * 4;
    const totalSize = alignedHeaderSize + metadataSize + weightsSize + vocabSizeSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new Uint8Array(buffer);

    // 写入模型标识和元数据
    for (let i = 0; i < header.length; i++) {
      view[i] = header.charCodeAt(i);
    }

    // 写入模型参数（从对齐后的位置开始）
    const dataView = new DataView(buffer, alignedHeaderSize);
    dataView.setUint32(0, inputSize, true);
    dataView.setUint32(4, outputSize, true);
    dataView.setUint32(8, this.trainingData.length, true);

    // 写入权重数据（确保 4 字节对齐）
    const weightsOffset = alignedHeaderSize + metadataSize;
    const weightsView = new Float32Array(buffer, weightsOffset, weights.length);
    weightsView.set(weights);

    // 写入词汇表大小
    const vocabSizeOffset = weightsOffset + weights.length * 4;
    const vocabView = new DataView(buffer, vocabSizeOffset);
    vocabView.setUint32(0, vocab.size, true);

    return buffer;
  }

  async saveModelToFile(_path: string): Promise<void> {
    console.log('开始生成和下载模型...');
    
    const modelData = await this.generateModel();

    // 创建下载链接
    const blob = new Blob([modelData], { type: 'application/octet-stream' });
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'chapter_classifier.onnx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    URL.revokeObjectURL(url);

    console.log('模型文件已下载');
  }

  // 获取训练统计信息
  getTrainingStats(): { totalSamples: number; positiveSamples: number; negativeSamples: number; books: string[] } {
    const positiveSamples = this.trainingData.filter(sample => sample.isChapter).length;
    const negativeSamples = this.trainingData.filter(sample => !sample.isChapter).length;
    
    return {
      totalSamples: this.trainingData.length,
      positiveSamples,
      negativeSamples,
      books: ['camelXiangzi', 'JaneEyre', 'shakespeare', 'walden', 'theThreeKingdoms', 'princekin', 'snowWhite', 'theWealthOfNations', 'TheHunchbackofNotre-Dame']
    };
  }
}

// 导出模型生成器实例
export const modelGenerator = ChapterModelGenerator.getInstance();
