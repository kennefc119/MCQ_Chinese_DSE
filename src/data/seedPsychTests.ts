import { PsychTest } from "../types/database";

export const SEED_PSYCH_TESTS: PsychTest[] = [
  {
    id: "psy-character-match",
    slug: "character-match",
    title: "你是哪位文言文人物？",
    description: "從十二篇指定篇章中，找出與你最相似的歷史／文學人物。",
    icon_name: "person.fill.questionmark",
    question_count: 5,
    estimated_minutes: 3,
    questions: [
      {
        id: "q1",
        text: "面對挫折時你會：",
        options: [
          { label: "勇於力爭，據理而為", value: 1, dimension: "linxiangru" },
          { label: "退一步思考，以大局為重", value: 1, dimension: "kongzi" },
          { label: "順其自然，逍遙處之", value: 1, dimension: "zhuangzi" },
          { label: "立志苦讀以圖將來", value: 1, dimension: "xunzi" },
        ],
      },
      {
        id: "q2",
        text: "你最看重什麼？",
        options: [
          { label: "義氣與正直", value: 1, dimension: "linxiangru" },
          { label: "仁愛與禮", value: 1, dimension: "kongzi" },
          { label: "自由與心境", value: 1, dimension: "zhuangzi" },
          { label: "學問與積累", value: 1, dimension: "xunzi" },
        ],
      },
      {
        id: "q3",
        text: "閒時你最喜歡：",
        options: [
          { label: "與朋友論天下大事", value: 1, dimension: "linxiangru" },
          { label: "與弟子討論修身之道", value: 1, dimension: "kongzi" },
          { label: "獨自漫遊山水之間", value: 1, dimension: "zhuangzi" },
          { label: "讀書到深夜", value: 1, dimension: "xunzi" },
        ],
      },
      {
        id: "q4",
        text: "別人冒犯你，你會：",
        options: [
          { label: "據理力爭，但顧大局", value: 1, dimension: "linxiangru" },
          { label: "反求諸己，自省自警", value: 1, dimension: "kongzi" },
          { label: "笑而不語，不放心上", value: 1, dimension: "zhuangzi" },
          { label: "用學識回應對方", value: 1, dimension: "xunzi" },
        ],
      },
      {
        id: "q5",
        text: "你的夢想是：",
        options: [
          { label: "為國效力，名留青史", value: 1, dimension: "linxiangru" },
          { label: "成為一位有德之人", value: 1, dimension: "kongzi" },
          { label: "活得自在無拘", value: 1, dimension: "zhuangzi" },
          { label: "成為飽學之士", value: 1, dimension: "xunzi" },
        ],
      },
    ],
    results: [
      { code: "linxiangru", title: "你是藺相如", description: "智勇兼備，臨危不亂，能屈能伸。先公後私的胸襟令人敬服。", emoji: "⚔️" },
      { code: "kongzi", title: "你是孔子", description: "重仁守禮，謙恭好學。「克己復禮」、「反求諸己」是你的修身之道。", emoji: "📖" },
      { code: "zhuangzi", title: "你是莊子", description: "心境逍遙，看透世俗。「無用之用」乃你的智慧。", emoji: "🍃" },
      { code: "xunzi", title: "你是荀子", description: "勤學不輟，相信「鍥而不舍」。「青出於藍」是你的座右銘。", emoji: "📚" },
    ],
  },
  {
    id: "psy-study-style",
    slug: "study-style",
    title: "你的學習風格",
    description: "了解最適合你的溫習方式，讓 DSE 備戰事半功倍。",
    icon_name: "books.vertical.fill",
    question_count: 4,
    estimated_minutes: 2,
    questions: [
      {
        id: "q1",
        text: "新學一個概念，你最快透過：",
        options: [
          { label: "看圖表／流程圖", value: 1, dimension: "visual" },
          { label: "聽老師講解", value: 1, dimension: "auditory" },
          { label: "親自做習題", value: 1, dimension: "kinesthetic" },
          { label: "閱讀文字解說", value: 1, dimension: "reading" },
        ],
      },
      {
        id: "q2",
        text: "背書時你會：",
        options: [
          { label: "畫心智圖", value: 1, dimension: "visual" },
          { label: "朗讀／錄音重聽", value: 1, dimension: "auditory" },
          { label: "邊抄邊背", value: 1, dimension: "kinesthetic" },
          { label: "重複默寫", value: 1, dimension: "reading" },
        ],
      },
      {
        id: "q3",
        text: "課堂上你最專注的時候：",
        options: [
          { label: "看到投影片色彩豐富", value: 1, dimension: "visual" },
          { label: "老師講故事", value: 1, dimension: "auditory" },
          { label: "做小組活動", value: 1, dimension: "kinesthetic" },
          { label: "做筆記時", value: 1, dimension: "reading" },
        ],
      },
      {
        id: "q4",
        text: "考試前一天，你會：",
        options: [
          { label: "看自己畫的筆記圖", value: 1, dimension: "visual" },
          { label: "找同學互問互答", value: 1, dimension: "auditory" },
          { label: "做模擬卷", value: 1, dimension: "kinesthetic" },
          { label: "重讀整份筆記", value: 1, dimension: "reading" },
        ],
      },
    ],
    results: [
      { code: "visual", title: "視覺型學習者", description: "善於從圖像、色彩、空間排列獲得資訊。多用心智圖、流程圖、表格。", emoji: "👁️" },
      { code: "auditory", title: "聽覺型學習者", description: "從聲音與討論中學最快。試著朗讀、錄音重聽，或找同學互相講解。", emoji: "👂" },
      { code: "kinesthetic", title: "動手實作型", description: "做才能記得。多做模擬題、抄寫、實作活動。", emoji: "✋" },
      { code: "reading", title: "閱讀／書寫型", description: "靠閱讀文字最為踏實。多寫讀書筆記、整理重點。", emoji: "📖" },
    ],
  },
  {
    id: "psy-career-inclination",
    slug: "career-inclination",
    title: "DSE 後路向初探",
    description: "5 分鐘小測，看看你可能適合哪類大學科目／職業方向。",
    icon_name: "graduationcap.fill",
    question_count: 5,
    estimated_minutes: 3,
    questions: [
      {
        id: "q1",
        text: "你最享受的活動是：",
        options: [
          { label: "解難題、思考邏輯", value: 1, dimension: "stem" },
          { label: "創作、寫作、藝術", value: 1, dimension: "arts" },
          { label: "幫助他人、做義工", value: 1, dimension: "social" },
          { label: "規劃、做計算", value: 1, dimension: "business" },
        ],
      },
      {
        id: "q2",
        text: "你最常被人稱讚：",
        options: [
          { label: "聰明、解題快", value: 1, dimension: "stem" },
          { label: "有想像力、有藝術細胞", value: 1, dimension: "arts" },
          { label: "細心、有同理心", value: 1, dimension: "social" },
          { label: "務實、有領導力", value: 1, dimension: "business" },
        ],
      },
      {
        id: "q3",
        text: "你看新聞最關注：",
        options: [
          { label: "科技、太空、AI", value: 1, dimension: "stem" },
          { label: "電影、音樂、文化", value: 1, dimension: "arts" },
          { label: "教育、社福、心理健康", value: 1, dimension: "social" },
          { label: "經濟、創業、投資", value: 1, dimension: "business" },
        ],
      },
      {
        id: "q4",
        text: "你的理想工作環境：",
        options: [
          { label: "實驗室／研究所", value: 1, dimension: "stem" },
          { label: "工作室／劇場", value: 1, dimension: "arts" },
          { label: "學校／醫院／社福機構", value: 1, dimension: "social" },
          { label: "辦公室／企業", value: 1, dimension: "business" },
        ],
      },
      {
        id: "q5",
        text: "你選科時最看重：",
        options: [
          { label: "邏輯與技術挑戰", value: 1, dimension: "stem" },
          { label: "創意空間", value: 1, dimension: "arts" },
          { label: "對人與社會的影響", value: 1, dimension: "social" },
          { label: "前途與收入", value: 1, dimension: "business" },
        ],
      },
    ],
    results: [
      { code: "stem", title: "理工探索者", description: "邏輯思維強，適合科學、工程、電腦、數學等領域。", emoji: "🔬" },
      { code: "arts", title: "創作藝術派", description: "想像力豐富，適合文學、藝術、設計、傳媒。", emoji: "🎨" },
      { code: "social", title: "助人服務型", description: "同理心強，適合教育、社工、心理、醫護等職業。", emoji: "🤝" },
      { code: "business", title: "務實謀略派", description: "目標清晰，適合商科、經濟、管理、法律。", emoji: "💼" },
    ],
  },
];
