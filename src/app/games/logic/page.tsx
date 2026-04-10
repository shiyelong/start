"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

interface Puzzle {
  id: number;
  title: string;
  difficulty: "中等" | "困难" | "地狱";
  story: string;
  clues: string[];
  question: string;
  options: string[];
  answer: number; // index
  explanation: string;
  category: string;
}

const puzzles: Puzzle[] = [
  {
    id: 1, title: "谁养了鱼？", difficulty: "困难", category: "排列推理",
    story: "五栋不同颜色的房子住着五个不同国籍的人，每人喝不同饮料、抽不同烟、养不同宠物。",
    clues: [
      "英国人住红色房子",
      "瑞典人养狗",
      "丹麦人喝茶",
      "绿色房子在白色房子左边",
      "绿色房子主人喝咖啡",
      "抽Pall Mall的人养鸟",
      "黄色房子主人抽Dunhill",
      "住中间房子的人喝牛奶",
      "挪威人住第一栋",
      "抽Blends的人住养猫人隔壁",
      "养马的人住抽Dunhill的人隔壁",
      "抽BlueMaster的人喝啤酒",
      "德国人抽Prince",
      "挪威人住蓝色房子隔壁",
      "抽Blends的人有个喝水的邻居",
    ],
    question: "谁养了鱼？",
    options: ["英国人", "瑞典人", "丹麦人", "挪威人", "德国人"],
    answer: 4,
    explanation: "通过逐步排除法：挪威人住第1栋黄色房子，第2栋蓝色住丹麦人，第3栋红色住英国人喝牛奶，第4栋绿色住德国人喝咖啡，第5栋白色住瑞典人。最终推理出德国人养鱼。",
  },
  {
    id: 2, title: "真话假话", difficulty: "中等", category: "逻辑判断",
    story: "岛上有两种人：骑士（永远说真话）和无赖（永远说假话）。你遇到了A、B、C三个人。",
    clues: [
      "A说：「我们三个都是无赖」",
      "B说：「我们中恰好有一个骑士」",
      "C什么都没说",
    ],
    question: "B是什么身份？",
    options: ["骑士", "无赖", "无法确定", "既不是骑士也不是无赖"],
    answer: 0,
    explanation: "如果A是骑士，他说的「都是无赖」就是真话，但他自己是骑士，矛盾。所以A是无赖。A说「都是无赖」是假话，说明至少有一个骑士。如果B是无赖，他说「恰好一个骑士」是假话，但A是无赖且至少有一个骑士，那C必须是骑士，此时恰好一个骑士，B的话就成了真话，矛盾。所以B是骑士。",
  },
  {
    id: 3, title: "帽子问题", difficulty: "困难", category: "博弈推理",
    story: "三个聪明人A、B、C排成一列。有3顶红帽2顶白帽，每人戴一顶。C能看到A和B的帽子，B能看到A的帽子，A谁都看不到。",
    clues: [
      "先问C：你知道自己帽子颜色吗？C说：不知道",
      "再问B：你知道自己帽子颜色吗？B说：不知道",
      "最后问A：你知道自己帽子颜色吗？",
      "三人都绝顶聪明，能做出完美推理",
    ],
    question: "A的帽子是什么颜色？",
    options: ["红色", "白色", "无法确定", "可能是红也可能是白"],
    answer: 0,
    explanation: "C看到A和B，如果A和B都是白帽，C就知道自己是红帽（只有2白）。C不知道→A和B不全是白。B知道这个推理，如果B看到A是白帽，那B就知道自己不能也是白帽（否则C就能确定），所以B就知道自己是红帽。但B不知道→A不是白帽→A是红帽。A通过这个推理链得出自己是红帽。",
  },
  {
    id: 4, title: "毒酒问题", difficulty: "地狱", category: "信息论",
    story: "国王有1000桶酒，其中1桶有毒。毒酒喝后恰好24小时发作。明天就是宴会，国王有一些囚犯可以试毒。",
    clues: [
      "每个囚犯可以喝任意多桶酒的混合",
      "毒酒喝一滴就会在24小时后死亡",
      "只有一次试毒机会（24小时后看结果）",
      "需要用最少的囚犯找出毒酒",
    ],
    question: "最少需要多少个囚犯？",
    options: ["10个", "100个", "500个", "999个"],
    answer: 0,
    explanation: "用二进制编码！1000<2^10=1024，所以10个囚犯就够。给每桶酒编号0-999的二进制，第i个囚犯喝所有第i位为1的酒。24小时后，死亡的囚犯组合就是毒酒的二进制编号。这是信息论的经典应用。",
  },
  {
    id: 5, title: "海盗分金", difficulty: "地狱", category: "博弈论",
    story: "5个海盗（A>B>C>D>E按等级排序）分100枚金币。最高等级的先提方案，超过半数同意则通过，否则提议者被扔下海，下一个人提。每个海盗都绝顶聪明且贪婪，优先保命。",
    clues: [
      "A先提方案，需要至少3票（含自己）通过",
      "如果A被扔下海，B提方案需要至少2票通过",
      "每个海盗都能完美逆推",
      "同等条件下海盗倾向于把别人扔下海",
    ],
    question: "A应该怎么分配才能存活且利益最大化？",
    options: ["A:98 B:0 C:1 D:0 E:1", "A:97 B:0 C:1 D:2 E:0", "A:100 B:0 C:0 D:0 E:0", "A:20 B:20 C:20 D:20 E:20"],
    answer: 0,
    explanation: "逆推：如果只剩D和E，D给自己100（自己投赞成就过半）。所以C提案时，给E一枚金币就能拉拢E（否则E一分没有），C:99 E:1。B提案时需要拉拢D（D在C方案中得0），B:99 D:1。A提案时需要拉拢C和E（他们在B方案中得0），A:98 C:1 E:1。",
  },
  {
    id: 6, title: "三门问题", difficulty: "中等", category: "概率推理",
    story: "你参加一个游戏节目。面前有三扇门，一扇后面是汽车，两扇后面是山羊。你选了1号门。主持人（知道答案）打开了3号门，后面是山羊。",
    clues: [
      "主持人永远会打开一扇有山羊的门",
      "主持人不会打开你选的门",
      "主持人知道每扇门后面是什么",
      "现在主持人问你要不要换到2号门",
    ],
    question: "换门后赢得汽车的概率是多少？",
    options: ["1/2（换不换一样）", "2/3（应该换）", "1/3（不该换）", "取决于运气"],
    answer: 1,
    explanation: "初始选中汽车的概率是1/3，没选中的概率是2/3。主持人打开一扇山羊门后，那2/3的概率全部集中到了剩下那扇门上。所以换门赢的概率是2/3，不换只有1/3。这就是著名的蒙提霍尔问题。",
  },
  {
    id: 7, title: "称球问题", difficulty: "地狱", category: "信息论",
    story: "有12个外观相同的球，其中一个是次品（可能偏重也可能偏轻）。你有一个天平。",
    clues: [
      "天平只能比较两组球的重量",
      "每次称量结果：左重、右重、或平衡",
      "需要找出次品球并确定它偏重还是偏轻",
      "要求用最少次数完成",
    ],
    question: "最少需要称几次？",
    options: ["2次", "3次", "4次", "5次"],
    answer: 1,
    explanation: "3次。每次称量有3种结果，3次共3^3=27种组合，而12个球×2种可能（偏重/偏轻）=24种情况<27。第一次：4vs4。如果平衡，次品在剩余4个中，2次可解。如果不平衡，标记可能偏重/偏轻的球，通过巧妙分组2次可解。这是信息论最优解。",
  },
  {
    id: 8, title: "囚徒困境", difficulty: "困难", category: "博弈论",
    story: "100个囚犯，每人头上随机放红或蓝帽子。从最后一个开始，每人必须猜自己帽子颜色，猜对释放猜错处死。每个人能看到前面所有人的帽子，能听到后面所有人的回答。",
    clues: [
      "他们可以事先商量策略",
      "每人只能说「红」或「蓝」",
      "第100个人（最后面）先猜",
      "每人能看到前面99人的帽子",
    ],
    question: "最优策略下，最少能保证多少人存活？",
    options: ["50人", "99人", "100人", "75人"],
    answer: 1,
    explanation: "策略：第100人数前面99人中红帽的奇偶性，如果是奇数说「红」，偶数说「蓝」（他自己50%存活）。第99人听到第100人的回答后，数前面98人的红帽数，就能推出自己的颜色。以此类推，前99人都能100%确定自己的颜色。所以最少保证99人存活。",
  },
];

const DIFF_COLORS: Record<string, string> = { "中等": "text-[#f0b90b]", "困难": "text-[#ff4444]", "地狱": "text-[#a855f7]" };

export default function LogicPage() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<Set<number>>(new Set());
  const [showClues, setShowClues] = useState(true);

  const puzzle = puzzles[currentIdx];

  const submit = useCallback(() => {
    if (selected === null || revealed) return;
    setRevealed(true);
    if (selected === puzzle.answer) setScore(s => s + (puzzle.difficulty === "地狱" ? 3 : puzzle.difficulty === "困难" ? 2 : 1));
    setAnswered(prev => new Set(Array.from(prev).concat(currentIdx)));
  }, [selected, revealed, puzzle, currentIdx]);

  const next = () => {
    const nextIdx = (currentIdx + 1) % puzzles.length;
    setCurrentIdx(nextIdx);
    setSelected(null);
    setRevealed(false);
    setShowClues(true);
  };

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-brain mr-2 text-[#ff4444]" />逻辑推理</h1>
        <div className="flex justify-center gap-4 text-sm mb-4">
          <span className="text-[#f0b90b]"><i className="fas fa-star mr-1" />{score}分</span>
          <span className="text-[#3ea6ff]"><i className="fas fa-check mr-1" />{answered.size}/{puzzles.length}</span>
        </div>

        {/* 题目导航 */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 justify-center">
          {puzzles.map((p, i) => (
            <button key={i} onClick={() => { setCurrentIdx(i); setSelected(null); setRevealed(answered.has(i)); setShowClues(true); }}
              className={clsx(
                "w-8 h-8 rounded-lg text-[11px] font-bold border transition shrink-0 flex items-center justify-center",
                currentIdx === i ? "bg-[#ff4444] text-white border-[#ff4444]" :
                answered.has(i) ? "bg-[#2ba640]/20 text-[#2ba640] border-[#2ba640]/30" :
                "text-[#aaa] border-[#333] hover:text-white"
              )}>{i + 1}</button>
          ))}
        </div>

        {/* 题目卡片 */}
        <div className="rounded-xl bg-[#1a1a1a] border border-[#333] overflow-hidden mb-4">
          {/* 头部 */}
          <div className="p-4 border-b border-[#333]/50">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[11px] font-bold ${DIFF_COLORS[puzzle.difficulty]}`}>{puzzle.difficulty}</span>
              <span className="text-[10px] text-[#8a8a8a] px-1.5 py-0.5 rounded bg-[#212121]">{puzzle.category}</span>
            </div>
            <h2 className="font-bold text-base mb-2">{puzzle.title}</h2>
            <p className="text-sm text-[#aaa]">{puzzle.story}</p>
          </div>

          {/* 线索 */}
          <div className="p-4 border-b border-[#333]/50">
            <button onClick={() => setShowClues(!showClues)} className="flex items-center gap-1.5 text-xs text-[#3ea6ff] mb-2">
              <i className={`fas fa-chevron-${showClues ? "down" : "right"} text-[10px]`} />
              线索（{puzzle.clues.length}条）
            </button>
            {showClues && (
              <div className="space-y-1.5">
                {puzzle.clues.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] text-[#8a8a8a]">
                    <span className="w-5 h-5 rounded-full bg-[#212121] border border-[#333] flex items-center justify-center text-[10px] text-[#666] shrink-0">{i + 1}</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 问题 + 选项 */}
          <div className="p-4">
            <p className="font-semibold text-sm mb-3"><i className="fas fa-question-circle mr-1.5 text-[#f0b90b]" />{puzzle.question}</p>
            <div className="space-y-2">
              {puzzle.options.map((opt, i) => {
                const isCorrect = i === puzzle.answer;
                const isSelected = selected === i;
                return (
                  <button key={i} onClick={() => !revealed && setSelected(i)}
                    className={clsx(
                      "w-full p-3 rounded-xl border text-left text-sm transition",
                      revealed && isCorrect ? "bg-[#2ba640]/15 border-[#2ba640]/30 text-[#2ba640]" :
                      revealed && isSelected && !isCorrect ? "bg-[#ff4444]/15 border-[#ff4444]/30 text-[#ff4444]" :
                      isSelected ? "bg-[#3ea6ff]/15 border-[#3ea6ff]/30 text-[#3ea6ff]" :
                      "bg-[#212121] border-[#333] text-[#aaa] hover:border-[#555] hover:text-white"
                    )}>
                    <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                    {revealed && isCorrect && <i className="fas fa-check ml-2" />}
                    {revealed && isSelected && !isCorrect && <i className="fas fa-times ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 提交/解析 */}
          <div className="p-4 border-t border-[#333]/50">
            {!revealed ? (
              <button onClick={submit} disabled={selected === null}
                className={clsx("w-full py-3 rounded-xl font-bold text-sm transition active:scale-95",
                  selected === null ? "bg-[#333] text-[#666]" : "bg-[#ff4444] text-white hover:bg-[#ff6666]"
                )}>
                <i className="fas fa-paper-plane mr-1.5" />提交答案
              </button>
            ) : (
              <>
                <div className={clsx("p-3 rounded-xl mb-3 text-sm",
                  selected === puzzle.answer ? "bg-[#2ba640]/10 border border-[#2ba640]/20 text-[#2ba640]" : "bg-[#ff4444]/10 border border-[#ff4444]/20 text-[#ff4444]"
                )}>
                  {selected === puzzle.answer ? "✅ 回答正确！" : "❌ 回答错误"}
                </div>
                <div className="p-3 rounded-xl bg-[#212121] border border-[#333] text-[12px] text-[#aaa] mb-3">
                  <p className="font-bold text-[#f0b90b] text-xs mb-1"><i className="fas fa-lightbulb mr-1" />解析</p>
                  {puzzle.explanation}
                </div>
                <button onClick={next} className="w-full py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95">
                  下一题 <i className="fas fa-arrow-right ml-1" />
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
