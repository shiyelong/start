"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { SoundEngine } from "@/lib/game-engine/sound-engine";
import { ParticleSystem } from "@/lib/game-engine/particle-system";
import { InputHandler } from "@/lib/game-engine/input-handler";
import { lerp, updateShake, applyShake, updateScorePopups, renderScorePopups } from "@/lib/game-engine/animation-utils";
import type { ScorePopup, ShakeState } from "@/lib/game-engine/animation-utils";
import { drawGradientBackground, drawText, drawRoundedRect, drawGlow } from "@/lib/game-engine/render-utils";

// ─── Types ───────────────────────────────────────────────
interface Puzzle {
  id: number;
  title: string;
  difficulty: "中等" | "困难" | "地狱";
  story: string;
  clues: string[];
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  category: string;
}

interface GameState {
  puzzleIdx: number;
  selected: number | null;
  revealed: boolean;
  score: number;
  streak: number;
  bestStreak: number;
  answered: number;
  correct: number;
  timer: number;
  timerActive: boolean;
  over: boolean;
  paused: boolean;
}

interface AnimState {
  time: number;
  bgHue: number;
  targetBgHue: number;
  shake: ShakeState;
  scorePopups: ScorePopup[];
  hoverOption: number;
  feedbackAlpha: number;
  feedbackCorrect: boolean;
  questionFadeIn: number;
  timerPulse: number;
}

// ─── Constants ───────────────────────────────────────────
const GAME_ID = "logic";
const TOTAL_QUESTIONS = 10;
const TIME_PER_QUESTION = 15;
const OPTION_LABELS = ["A", "B", "C", "D", "E"];

// ─── Puzzle Data ─────────────────────────────────────────
const puzzles: Puzzle[] = [
  {
    id: 1, title: "谁养了鱼？", difficulty: "困难", category: "排列推理",
    story: "五栋不同颜色的房子住着五个不同国籍的人，每人喝不同饮料、抽不同烟、养不同宠物。",
    clues: ["英国人住红色房子", "瑞典人养狗", "丹麦人喝茶", "绿色房子在白色房子左边", "绿色房子主人喝咖啡", "抽Pall Mall的人养鸟", "黄色房子主人抽Dunhill", "住中间房子的人喝牛奶", "挪威人住第一栋", "抽Blends的人住养猫人隔壁", "养马的人住抽Dunhill的人隔壁", "抽BlueMaster的人喝啤酒", "德国人抽Prince", "挪威人住蓝色房子隔壁", "抽Blends的人有个喝水的邻居"],
    question: "谁养了鱼？",
    options: ["英国人", "瑞典人", "丹麦人", "挪威人", "德国人"],
    answer: 4,
    explanation: "通过逐步排除法推理出德国人养鱼。",
  },
  {
    id: 2, title: "真话假话", difficulty: "中等", category: "逻辑判断",
    story: "岛上有两种人：骑士（永远说真话）和无赖（永远说假话）。你遇到了A、B、C三个人。",
    clues: ["A说：「我们三个都是无赖」", "B说：「我们中恰好有一个骑士」", "C什么都没说"],
    question: "B是什么身份？",
    options: ["骑士", "无赖", "无法确定", "既不是骑士也不是无赖"],
    answer: 0,
    explanation: "A是无赖（自相矛盾），B是骑士（逻辑一致）。",
  },
  {
    id: 3, title: "帽子问题", difficulty: "困难", category: "博弈推理",
    story: "三个聪明人A、B、C排成一列。有3顶红帽2顶白帽，每人戴一顶。C能看到A和B的帽子，B能看到A的帽子，A谁都看不到。",
    clues: ["先问C：你知道自己帽子颜色吗？C说：不知道", "再问B：你知道自己帽子颜色吗？B说：不知道", "最后问A：你知道自己帽子颜色吗？", "三人都绝顶聪明，能做出完美推理"],
    question: "A的帽子是什么颜色？",
    options: ["红色", "白色", "无法确定", "可能是红也可能是白"],
    answer: 0,
    explanation: "通过推理链：C不知道→AB不全白；B不知道→A不是白→A是红。",
  },
  {
    id: 4, title: "毒酒问题", difficulty: "地狱", category: "信息论",
    story: "国王有1000桶酒，其中1桶有毒。毒酒喝后恰好24小时发作。明天就是宴会，国王有一些囚犯可以试毒。",
    clues: ["每个囚犯可以喝任意多桶酒的混合", "毒酒喝一滴就会在24小时后死亡", "只有一次试毒机会（24小时后看结果）", "需要用最少的囚犯找出毒酒"],
    question: "最少需要多少个囚犯？",
    options: ["10个", "100个", "500个", "999个"],
    answer: 0,
    explanation: "用二进制编码！1000<2^10=1024，所以10个囚犯就够。",
  },
  {
    id: 5, title: "海盗分金", difficulty: "地狱", category: "博弈论",
    story: "5个海盗分100枚金币。最高等级的先提方案，超过半数同意则通过，否则提议者被扔下海。",
    clues: ["A先提方案，需要至少3票通过", "如果A被扔下海，B提方案需要至少2票通过", "每个海盗都能完美逆推", "同等条件下海盗倾向于把别人扔下海"],
    question: "A应该怎么分配才能存活且利益最大化？",
    options: ["A:98 B:0 C:1 D:0 E:1", "A:97 B:0 C:1 D:2 E:0", "A:100 B:0 C:0 D:0 E:0", "A:20 B:20 C:20 D:20 E:20"],
    answer: 0,
    explanation: "逆推法：A拉拢C和E（他们在B方案中得0），A:98 C:1 E:1。",
  },
  {
    id: 6, title: "三门问题", difficulty: "中等", category: "概率推理",
    story: "你参加游戏节目。面前有三扇门，一扇后面是汽车，两扇后面是山羊。你选了1号门。主持人打开了3号门，后面是山羊。",
    clues: ["主持人永远会打开一扇有山羊的门", "主持人不会打开你选的门", "主持人知道每扇门后面是什么", "现在主持人问你要不要换到2号门"],
    question: "换门后赢得汽车的概率是多少？",
    options: ["1/2（换不换一样）", "2/3（应该换）", "1/3（不该换）", "取决于运气"],
    answer: 1,
    explanation: "蒙提霍尔问题：换门赢的概率是2/3，不换只有1/3。",
  },
  {
    id: 7, title: "称球问题", difficulty: "地狱", category: "信息论",
    story: "有12个外观相同的球，其中一个是次品（可能偏重也可能偏轻）。你有一个天平。",
    clues: ["天平只能比较两组球的重量", "每次称量结果：左重、右重、或平衡", "需要找出次品球并确定它偏重还是偏轻", "要求用最少次数完成"],
    question: "最少需要称几次？",
    options: ["2次", "3次", "4次", "5次"],
    answer: 1,
    explanation: "3次。3^3=27种组合 > 12×2=24种情况，信息论最优解。",
  },
  {
    id: 8, title: "囚徒困境", difficulty: "困难", category: "博弈论",
    story: "100个囚犯，每人头上随机放红或蓝帽子。从最后一个开始，每人必须猜自己帽子颜色。",
    clues: ["他们可以事先商量策略", "每人只能说「红」或「蓝」", "第100个人先猜", "每人能看到前面99人的帽子"],
    question: "最优策略下，最少能保证多少人存活？",
    options: ["50人", "99人", "100人", "75人"],
    answer: 1,
    explanation: "第100人用奇偶性编码，前99人都能100%确定自己的颜色。",
  },
  {
    id: 9, title: "过河问题", difficulty: "中等", category: "逻辑推理",
    story: "农夫要带狼、羊、白菜过河。船每次只能带一样东西。",
    clues: ["狼和羊不能单独在一起", "羊和白菜不能单独在一起", "农夫不在时才会出问题", "船只能坐农夫和一样东西"],
    question: "最少需要几次过河？",
    options: ["5次", "7次", "9次", "11次"],
    answer: 1,
    explanation: "经典解法需要7次：先带羊过去，回来带狼，带羊回来，带白菜过去，回来带羊。",
  },
  {
    id: 10, title: "逻辑炸弹", difficulty: "困难", category: "逻辑推理",
    story: "有一个炸弹，上面有红蓝两根线。拆弹专家说了三句话。",
    clues: ["如果红线是安全的，那么蓝线也是安全的", "红线和蓝线中至少有一根是危险的", "如果蓝线是危险的，那么红线也是危险的"],
    question: "应该剪哪根线？",
    options: ["剪红线", "剪蓝线", "两根都剪", "两根都不剪"],
    answer: 1,
    explanation: "由条件推理：红线危险，蓝线安全。应该剪蓝线（安全的那根）。",
  },
  {
    id: 11, title: "数字规律", difficulty: "中等", category: "模式识别",
    story: "观察以下数列，找出规律。",
    clues: ["数列：1, 1, 2, 3, 5, 8, 13, ?", "每个数与前面的数有关", "这是一个著名的数列"],
    question: "下一个数是什么？",
    options: ["18", "20", "21", "26"],
    answer: 2,
    explanation: "斐波那契数列：每个数等于前两个数之和。8+13=21。",
  },
  {
    id: 12, title: "天平称量", difficulty: "困难", category: "数学推理",
    story: "你有一个天平和若干砝码。需要用最少的砝码称出1到40克的所有整数重量。",
    clues: ["砝码可以放在天平两边", "物品放在一边，砝码可以放两边", "需要称出1-40克所有整数重量"],
    question: "最少需要几个砝码？",
    options: ["4个", "5个", "6个", "7个"],
    answer: 0,
    explanation: "用三进制：1,3,9,27四个砝码可以称出1-40所有整数重量。",
  },
];

const DIFF_POINTS: Record<string, number> = { "中等": 10, "困难": 20, "地狱": 30 };
const DIFF_COLORS: Record<string, string> = { "中等": "#f0b90b", "困难": "#ff4444", "地狱": "#a855f7" };

// ─── Game Logic (Pure Functions) ─────────────────────────
function initGameState(): GameState {
  return {
    puzzleIdx: 0,
    selected: null,
    revealed: false,
    score: 0,
    streak: 0,
    bestStreak: 0,
    answered: 0,
    correct: 0,
    timer: TIME_PER_QUESTION,
    timerActive: true,
    over: false,
    paused: false,
  };
}

function shufflePuzzles(): number[] {
  const indices = puzzles.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, TOTAL_QUESTIONS);
}

function getPoints(puzzle: Puzzle, streak: number): number {
  const base = DIFF_POINTS[puzzle.difficulty] || 10;
  const bonus = Math.min(streak, 5) * 5;
  return base + bonus;
}

// ─── Text Wrapping Utility ──────────────────────────────
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Renderer ────────────────────────────────────────────
function renderGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  game: GameState,
  anim: AnimState,
  particles: ParticleSystem,
  dpr: number,
  puzzleOrder: number[],
): void {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  drawGradientBackground(ctx, w, h, anim.bgHue, 50);

  // Apply shake
  applyShake(ctx, anim.shake);

  const puzzle = puzzles[puzzleOrder[game.puzzleIdx]];
  if (!puzzle) { ctx.restore(); return; }

  const pad = 16;
  const contentW = Math.min(w - pad * 2, 440);
  const cx = w / 2;
  const startX = (w - contentW) / 2;
  let y = 12;

  // ─── Timer bar ─────────────────────────────────
  if (!game.over && !game.revealed) {
    const barW = contentW;
    const barH = 6;
    const barX = startX;
    const ratio = Math.max(0, game.timer / TIME_PER_QUESTION);
    const timerColor = ratio > 0.5 ? "#22c55e" : ratio > 0.2 ? "#f0b90b" : "#ff4444";

    // Pulse when low
    const pulse = ratio < 0.2 ? 0.7 + 0.3 * Math.sin(anim.timerPulse * 8) : 1;

    drawRoundedRect(ctx, barX, y, barW, barH, 3);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fill();

    if (ratio > 0) {
      drawRoundedRect(ctx, barX, y, barW * ratio, barH, 3);
      ctx.fillStyle = timerColor;
      ctx.globalAlpha = pulse;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Timer text
    ctx.fillStyle = timerColor;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`${Math.ceil(game.timer)}s`, startX + contentW, y + barH + 2);
    y += barH + 16;
  } else {
    y += 8;
  }

  // ─── Question card ─────────────────────────────
  if (!game.over) {
    const fadeAlpha = Math.min(1, anim.questionFadeIn);

    ctx.globalAlpha = fadeAlpha;

    // Difficulty + category badge
    const diffColor = DIFF_COLORS[puzzle.difficulty] || "#aaa";
    ctx.fillStyle = diffColor;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(puzzle.difficulty, startX, y);

    const diffW = ctx.measureText(puzzle.difficulty).width;
    ctx.fillStyle = "#666";
    ctx.font = "10px sans-serif";
    ctx.fillText(` · ${puzzle.category}`, startX + diffW, y + 1);
    y += 18;

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(puzzle.title, startX, y, contentW);
    y += 24;

    // Story (wrapped)
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "13px sans-serif";
    const storyLines = wrapText(ctx, puzzle.story, contentW);
    for (const line of storyLines) {
      ctx.fillText(line, startX, y, contentW);
      y += 18;
    }
    y += 8;

    // Clues
    ctx.fillStyle = "#3ea6ff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(`线索（${puzzle.clues.length}条）`, startX, y);
    y += 16;

    ctx.font = "12px sans-serif";
    for (let i = 0; i < puzzle.clues.length; i++) {
      ctx.fillStyle = "#555";
      ctx.fillText(`${i + 1}.`, startX, y);
      ctx.fillStyle = "#8a8a8a";
      const clueLines = wrapText(ctx, puzzle.clues[i], contentW - 20);
      for (const cl of clueLines) {
        ctx.fillText(cl, startX + 20, y, contentW - 20);
        y += 16;
      }
    }
    y += 12;

    // Question
    ctx.fillStyle = "#f0b90b";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    const qLines = wrapText(ctx, `? ${puzzle.question}`, contentW);
    for (const ql of qLines) {
      ctx.fillText(ql, startX, y, contentW);
      y += 20;
    }
    y += 10;

    // ─── Options ─────────────────────────────────
    const optH = 44;
    const optGap = 8;

    for (let i = 0; i < puzzle.options.length; i++) {
      const optY = y + i * (optH + optGap);
      const isSelected = game.selected === i;
      const isCorrect = i === puzzle.answer;
      const isHovered = anim.hoverOption === i && !game.revealed;

      let bgColor = "rgba(33, 33, 33, 0.8)";
      let borderColor = "#333333";
      let textColor = "#aaaaaa";

      if (game.revealed) {
        if (isCorrect) {
          bgColor = "rgba(43, 166, 64, 0.15)";
          borderColor = "rgba(43, 166, 64, 0.5)";
          textColor = "#2ba640";
        } else if (isSelected && !isCorrect) {
          bgColor = "rgba(255, 68, 68, 0.15)";
          borderColor = "rgba(255, 68, 68, 0.5)";
          textColor = "#ff4444";
        }
      } else if (isSelected) {
        bgColor = "rgba(62, 166, 255, 0.15)";
        borderColor = "rgba(62, 166, 255, 0.5)";
        textColor = "#3ea6ff";
      } else if (isHovered) {
        borderColor = "#555555";
        textColor = "#ffffff";
      }

      // Option background
      drawRoundedRect(ctx, startX, optY, contentW, optH, 10);
      ctx.fillStyle = bgColor;
      ctx.fill();
      drawRoundedRect(ctx, startX, optY, contentW, optH, 10);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Glow for correct answer when revealed
      if (game.revealed && isCorrect) {
        drawGlow(ctx, startX + contentW / 2, optY + optH / 2, contentW * 0.4, "#2ba640", 0.15);
      }

      // Option label
      ctx.fillStyle = textColor;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${OPTION_LABELS[i]}.`, startX + 14, optY + optH / 2);

      // Option text
      ctx.font = "13px sans-serif";
      ctx.fillText(puzzle.options[i], startX + 38, optY + optH / 2, contentW - 60);

      // Check / X icon when revealed
      if (game.revealed && isCorrect) {
        ctx.fillStyle = "#2ba640";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("?", startX + contentW - 14, optY + optH / 2);
      } else if (game.revealed && isSelected && !isCorrect) {
        ctx.fillStyle = "#ff4444";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("?", startX + contentW - 14, optY + optH / 2);
      }
    }

    y += puzzle.options.length * (optH + optGap) + 8;

    // ─── Feedback / Explanation ───────────────────
    if (game.revealed && anim.feedbackAlpha > 0) {
      ctx.globalAlpha = Math.min(1, anim.feedbackAlpha);

      const fbColor = anim.feedbackCorrect ? "#2ba640" : "#ff4444";
      const fbText = anim.feedbackCorrect ? "? 回答正确！" : "? 回答错误";

      // Feedback box
      drawRoundedRect(ctx, startX, y, contentW, 36, 10);
      ctx.fillStyle = anim.feedbackCorrect ? "rgba(43,166,64,0.1)" : "rgba(255,68,68,0.1)";
      ctx.fill();
      drawRoundedRect(ctx, startX, y, contentW, 36, 10);
      ctx.strokeStyle = anim.feedbackCorrect ? "rgba(43,166,64,0.2)" : "rgba(255,68,68,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = fbColor;
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fbText, cx, y + 18);
      y += 44;

      // Explanation box
      drawRoundedRect(ctx, startX, y, contentW, 60, 10);
      ctx.fillStyle = "rgba(33, 33, 33, 0.8)";
      ctx.fill();
      drawRoundedRect(ctx, startX, y, contentW, 60, 10);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#f0b90b";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(" 解析", startX + 12, y + 8);

      ctx.fillStyle = "#aaa";
      ctx.font = "11px sans-serif";
      const expLines = wrapText(ctx, puzzle.explanation, contentW - 24);
      let ey = y + 24;
      for (const el of expLines.slice(0, 3)) {
        ctx.fillText(el, startX + 12, ey, contentW - 24);
        ey += 14;
      }
      y += 68;

      // "Next" button
      y += 8;
      const btnW = contentW;
      const btnH = 42;
      drawRoundedRect(ctx, startX, y, btnW, btnH, 10);
      ctx.fillStyle = "#3ea6ff";
      ctx.fill();

      ctx.fillStyle = "#0f0f0f";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const nextText = game.answered >= TOTAL_QUESTIONS ? "查看结果 →" : "下一题 →";
      ctx.fillText(nextText, cx, y + btnH / 2);
      y += btnH + 12;

      ctx.globalAlpha = 1;
    }

    // ─── Submit button (when not revealed and selected) ──
    if (!game.revealed && game.selected !== null) {
      const btnW = contentW;
      const btnH = 42;
      drawRoundedRect(ctx, startX, y, btnW, btnH, 10);
      ctx.fillStyle = "#ff4444";
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("提交答案", cx, y + btnH / 2);
      y += btnH + 12;
    }

    ctx.globalAlpha = 1;
  }

  // ─── Game Over Screen ──────────────────────────
  if (game.over) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, w, h);

    const cardW = Math.min(w - 32, 360);
    const cardH = 280;
    const cardX = (w - cardW) / 2;
    const cardY = (h - cardH) / 2;

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fillStyle = "rgba(26, 26, 26, 0.95)";
    ctx.fill();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    let gy = cardY + 28;
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, gy);
    gy += 32;

    ctx.fillStyle = "#f0b90b";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("挑战完成！", cx, gy);
    gy += 32;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`${game.score} 分`, cx, gy);
    gy += 36;

    ctx.fillStyle = "#8a8a8a";
    ctx.font = "13px sans-serif";
    ctx.fillText(`正确 ${game.correct}/${game.answered} · 最高连击 ${game.bestStreak}`, cx, gy);
    gy += 32;

    // Restart button
    const rbW = cardW - 40;
    const rbH = 40;
    const rbX = cardX + 20;
    drawRoundedRect(ctx, rbX, gy, rbW, rbH, 10);
    ctx.fillStyle = "#f0b90b";
    ctx.fill();

    ctx.fillStyle = "#0f0f0f";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("再来一局", cx, gy + rbH / 2);
  }

  // Particles
  particles.render(ctx);

  // Score popups
  renderScorePopups(ctx, anim.scorePopups);

  // Pause overlay
  if (game.paused && !game.over) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, "⏸ 已暂停", w / 2, h / 2, w * 0.8, "#ffffff", 28);
    drawText(ctx, "点击继续", w / 2, h / 2 + 36, w * 0.6, "#8a8a8a", 14);
  }

  ctx.restore();
}

// ─── Component ───────────────────────────────────────────
export default function LogicPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(null!);
  const animRef = useRef<AnimState>({
    time: 0,
    bgHue: 280,
    targetBgHue: 280,
    shake: { time: 0, intensity: 0 },
    scorePopups: [],
    hoverOption: -1,
    feedbackAlpha: 0,
    feedbackCorrect: false,
    questionFadeIn: 0,
    timerPulse: 0,
  });
  const soundRef = useRef<SoundEngine>(null!);
  const particlesRef = useRef<ParticleSystem>(null!);
  const inputRef = useRef<InputHandler>(null!);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreSubmittedRef = useRef(false);
  const puzzleOrderRef = useRef<number[]>([]);

  // React UI state (only for elements outside canvas)
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [, forceUpdate] = useState(0);

  // Initialize sound + particles
  useEffect(() => {
    soundRef.current = new SoundEngine(GAME_ID);
    particlesRef.current = new ParticleSystem(300);
  }, []);

  // Submit score
  const submitScore = useCallback(async (finalScore: number) => {
    if (scoreSubmittedRef.current || finalScore === 0) return;
    scoreSubmittedRef.current = true;
    try {
      await fetchWithAuth("/api/games/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: GAME_ID, score: finalScore }),
      });
    } catch { /* silent */ }
  }, []);

  // Init game
  const initGame = useCallback(() => {
    puzzleOrderRef.current = shufflePuzzles();
    gameRef.current = initGameState();
    const anim = animRef.current;
    anim.scorePopups = [];
    anim.shake = { time: 0, intensity: 0 };
    anim.feedbackAlpha = 0;
    anim.questionFadeIn = 0;
    anim.hoverOption = -1;
    anim.targetBgHue = 280;
    particlesRef.current?.clear();
    scoreSubmittedRef.current = false;
    setScore(0);
    setAnswered(0);
    setStreak(0);
    setGameOver(false);
    setPaused(false);
    forceUpdate(n => n + 1);
  }, []);

  // Handle answer submission
  const submitAnswer = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.revealed || game.selected === null || game.over || game.paused) return;

    const puzzle = puzzles[puzzleOrderRef.current[game.puzzleIdx]];
    if (!puzzle) return;

    game.revealed = true;
    game.timerActive = false;
    game.answered++;

    const anim = animRef.current;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas ? canvas.width / dpr : 400;

    if (game.selected === puzzle.answer) {
      // Correct
      game.streak++;
      if (game.streak > game.bestStreak) game.bestStreak = game.streak;
      game.correct++;
      const pts = getPoints(puzzle, game.streak);
      game.score += pts;
      anim.feedbackCorrect = true;
      anim.targetBgHue = 140; // green tint

      soundRef.current?.playScore(pts);
      particlesRef.current?.emitCelebration(w / 2, 100);

      anim.scorePopups.push({
        x: w / 2,
        y: 80,
        value: pts,
        life: 1.2,
        combo: game.streak,
      });
    } else {
      // Wrong
      game.streak = 0;
      anim.feedbackCorrect = false;
      anim.shake = { time: 0.3, intensity: 6 };
      anim.targetBgHue = 0; // red tint

      soundRef.current?.playError();
    }

    anim.feedbackAlpha = 0; // will animate in

    setScore(game.score);
    setAnswered(game.answered);
    setStreak(game.streak);
  }, []);

  // Handle time up
  const handleTimeUp = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.revealed || game.over || game.paused) return;

    game.revealed = true;
    game.timerActive = false;
    game.answered++;
    game.streak = 0;

    const anim = animRef.current;
    anim.feedbackCorrect = false;
    anim.feedbackAlpha = 0;
    anim.shake = { time: 0.4, intensity: 8 };
    anim.targetBgHue = 30; // orange tint

    soundRef.current?.playGameOver();

    setAnswered(game.answered);
    setStreak(0);
  }, []);

  // Next question
  const nextQuestion = useCallback(() => {
    const game = gameRef.current;
    if (!game || !game.revealed) return;

    if (game.answered >= TOTAL_QUESTIONS) {
      // Game over
      game.over = true;
      animRef.current.targetBgHue = 280;
      soundRef.current?.playLevelUp();

      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas ? canvas.width / dpr : 400;
      const h = canvas ? canvas.height / dpr : 600;
      particlesRef.current?.emitCelebration(w / 2, h / 2);

      submitScore(game.score);
      setGameOver(true);
      return;
    }

    game.puzzleIdx++;
    game.selected = null;
    game.revealed = false;
    game.timer = TIME_PER_QUESTION;
    game.timerActive = true;

    const anim = animRef.current;
    anim.questionFadeIn = 0;
    anim.feedbackAlpha = 0;
    anim.hoverOption = -1;
    anim.targetBgHue = 280;
  }, [submitScore]);

  // Handle canvas click
  const handleClick = useCallback((canvasX: number, canvasY: number) => {
    const game = gameRef.current;
    if (!game) return;

    // Handle pause click
    if (game.paused && !game.over) {
      game.paused = false;
      setPaused(false);
      return;
    }

    if (game.over) {
      // Check restart button click
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cardW = Math.min(w - 32, 360);
      const cardH = 280;
      const cardX = (w - cardW) / 2;
      const cardY = (h - cardH) / 2;
      const rbX = cardX + 20;
      const rbW = cardW - 40;
      const rbY = cardY + 28 + 32 + 32 + 36 + 32;
      const rbH = 40;

      if (canvasX >= rbX && canvasX <= rbX + rbW && canvasY >= rbY && canvasY <= rbY + rbH) {
        soundRef.current?.playClick();
        initGame();
      }
      return;
    }

    if (game.paused) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const puzzle = puzzles[puzzleOrderRef.current[game.puzzleIdx]];
    if (!puzzle) return;

    const pad = 16;
    const contentW = Math.min(w - pad * 2, 440);
    const startX = (w - contentW) / 2;

    // Calculate option positions (need to replicate layout math)
    // Timer bar + spacing
    let y = 12;
    if (!game.revealed) {
      y += 6 + 16; // timer bar + spacing
    } else {
      y += 8;
    }

    // Difficulty + title + story + clues + question
    // We approximate the y offset for options
    // This is a simplified hit-test; we compute approximate positions
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Recalculate layout to find option positions
    y += 18; // difficulty
    y += 24; // title

    ctx.font = "13px sans-serif";
    const storyLines = wrapText(ctx, puzzle.story, contentW);
    y += storyLines.length * 18 + 8;

    y += 16; // clues header
    ctx.font = "12px sans-serif";
    for (let i = 0; i < puzzle.clues.length; i++) {
      const clueLines = wrapText(ctx, puzzle.clues[i], contentW - 20);
      y += clueLines.length * 16;
    }
    y += 12;

    ctx.font = "bold 14px sans-serif";
    const qLines = wrapText(ctx, `? ${puzzle.question}`, contentW);
    y += qLines.length * 20 + 10;

    ctx.restore();

    const optH = 44;
    const optGap = 8;

    // Check option clicks
    if (!game.revealed) {
      for (let i = 0; i < puzzle.options.length; i++) {
        const optY = y + i * (optH + optGap);
        if (canvasX >= startX && canvasX <= startX + contentW &&
            canvasY >= optY && canvasY <= optY + optH) {
          game.selected = i;
          soundRef.current?.playClick();
          forceUpdate(n => n + 1);
          return;
        }
      }

      // Check submit button
      if (game.selected !== null) {
        const btnY = y + puzzle.options.length * (optH + optGap) + 8;
        const btnH = 42;
        if (canvasX >= startX && canvasX <= startX + contentW &&
            canvasY >= btnY && canvasY <= btnY + btnH) {
          submitAnswer();
          return;
        }
      }
    }

    // Check "next" button when revealed
    if (game.revealed) {
      // The next button is after options + feedback + explanation
      const afterOpts = y + puzzle.options.length * (optH + optGap) + 8;
      // feedback box: 36 + 8 gap
      // explanation box: 60 + 8 gap
      // next button starts at afterOpts + 36 + 8 + 60 + 8 + 8
      const nextBtnY = afterOpts + 36 + 8 + 60 + 8 + 8;
      const nextBtnH = 42;
      if (canvasX >= startX && canvasX <= startX + contentW &&
          canvasY >= nextBtnY && canvasY <= nextBtnY + nextBtnH) {
        soundRef.current?.playClick();
        nextQuestion();
        return;
      }
    }
  }, [initGame, submitAnswer, nextQuestion]);

  // Handle mouse move for hover
  const handleMouseMove = useCallback((canvasX: number, canvasY: number) => {
    const game = gameRef.current;
    if (!game || game.revealed || game.over || game.paused) {
      animRef.current.hoverOption = -1;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const puzzle = puzzles[puzzleOrderRef.current[game.puzzleIdx]];
    if (!puzzle) return;

    const pad = 16;
    const contentW = Math.min(w - pad * 2, 440);
    const startX = (w - contentW) / 2;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let y = 12 + 6 + 16 + 18 + 24;

    ctx.font = "13px sans-serif";
    const storyLines = wrapText(ctx, puzzle.story, contentW);
    y += storyLines.length * 18 + 8 + 16;

    ctx.font = "12px sans-serif";
    for (let i = 0; i < puzzle.clues.length; i++) {
      const clueLines = wrapText(ctx, puzzle.clues[i], contentW - 20);
      y += clueLines.length * 16;
    }
    y += 12;

    ctx.font = "bold 14px sans-serif";
    const qLines = wrapText(ctx, `? ${puzzle.question}`, contentW);
    y += qLines.length * 20 + 10;

    ctx.restore();

    const optH = 44;
    const optGap = 8;

    let hovered = -1;
    for (let i = 0; i < puzzle.options.length; i++) {
      const optY = y + i * (optH + optGap);
      if (canvasX >= startX && canvasX <= startX + contentW &&
          canvasY >= optY && canvasY <= optY + optH) {
        hovered = i;
        break;
      }
    }
    animRef.current.hoverOption = hovered;
  }, []);

  // Toggle pause
  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.over) return;
    game.paused = !game.paused;
    setPaused(game.paused);
  }, []);

  // Save/Load
  const handleSave = useCallback(() => {
    const game = gameRef.current;
    if (!game) return {};
    return {
      puzzleIdx: game.puzzleIdx,
      selected: game.selected,
      revealed: game.revealed,
      score: game.score,
      streak: game.streak,
      bestStreak: game.bestStreak,
      answered: game.answered,
      correct: game.correct,
      timer: game.timer,
      over: game.over,
      puzzleOrder: [...puzzleOrderRef.current],
    };
  }, []);

  const handleLoad = useCallback((data: unknown) => {
    try {
      const d = data as {
        puzzleIdx: number; selected: number | null; revealed: boolean;
        score: number; streak: number; bestStreak: number;
        answered: number; correct: number; timer: number;
        over: boolean; puzzleOrder: number[];
      };
      if (!d || typeof d.score !== "number" || typeof d.puzzleIdx !== "number" || !Array.isArray(d.puzzleOrder)) return;
      const game = gameRef.current;
      if (!game) return;
      game.puzzleIdx = d.puzzleIdx;
      game.selected = d.selected;
      game.revealed = d.revealed;
      game.score = d.score;
      game.streak = d.streak;
      game.bestStreak = d.bestStreak;
      game.answered = d.answered;
      game.correct = d.correct;
      game.timer = d.timer;
      game.timerActive = !d.revealed && !d.over;
      game.over = d.over;
      game.paused = false;
      puzzleOrderRef.current = d.puzzleOrder;
      animRef.current.scorePopups = [];
      animRef.current.feedbackAlpha = d.revealed ? 1 : 0;
      animRef.current.questionFadeIn = 1;
      animRef.current.hoverOption = -1;
      particlesRef.current?.clear();
      scoreSubmittedRef.current = false;
      setScore(d.score);
      setAnswered(d.answered);
      setStreak(d.streak);
      setGameOver(d.over);
      setPaused(false);
      forceUpdate(n => n + 1);
    } catch { /* ignore malformed data */ }
  }, []);

  // ─── Init ──────────────────────────────────────────────
  useEffect(() => {
    initGame();
  }, []);

  // ─── Animation Loop ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = Math.max(600, w * 1.6);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    resize();
    window.addEventListener("resize", resize);

    const timeUpRef = { fired: false };

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const rawDt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const dt = Math.min(rawDt, 50) / 1000;

      const anim = animRef.current;
      const game = gameRef.current;

      if (game && !game.paused) {
        anim.time += dt;
        anim.timerPulse += dt;

        // Timer countdown
        if (game.timerActive && !game.revealed && !game.over) {
          game.timer -= dt;
          if (game.timer <= 0) {
            game.timer = 0;
            game.timerActive = false;
            if (!timeUpRef.fired) {
              timeUpRef.fired = true;
              handleTimeUp();
            }
          }
        }

        // Reset timeUp flag when moving to next question
        if (game.timerActive && game.timer > 0) {
          timeUpRef.fired = false;
        }

        // Animate feedback fade in
        if (game.revealed && anim.feedbackAlpha < 1) {
          anim.feedbackAlpha = Math.min(1, anim.feedbackAlpha + dt * 4);
        }

        // Animate question fade in
        if (!game.revealed && anim.questionFadeIn < 1) {
          anim.questionFadeIn = Math.min(1, anim.questionFadeIn + dt * 3);
        }

        // Update shake
        updateShake(anim.shake, dt);

        // Update score popups
        updateScorePopups(anim.scorePopups, dt);

        // Update particles
        particlesRef.current?.update(dt);

        // Smooth bg hue
        anim.bgHue = lerp(anim.bgHue, anim.targetBgHue, 0.03);
      }

      // Render
      if (game) {
        const dpr = window.devicePixelRatio || 1;
        renderGame(ctx, canvas, game, anim, particlesRef.current!, dpr, puzzleOrderRef.current);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [handleTimeUp]);

  // ─── Input ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleClick(e.clientX - rect.left, e.clientY - rect.top);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleMouseMove(e.clientX - rect.left, e.clientY - rect.top);
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousemove", onMove);

    const input = new InputHandler(canvas);
    input.onTap((x, y) => handleClick(x, y));
    input.preventDefaults();
    inputRef.current = input;

    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousemove", onMove);
      input.dispose();
    };
  }, [handleClick, handleMouseMove]);

  // ─── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || game.over || game.paused) return;

      const puzzle = puzzles[puzzleOrderRef.current[game.puzzleIdx]];
      if (!puzzle) return;

      if (!game.revealed) {
        // 1-5 or A-E to select option
        const numKey = parseInt(e.key);
        if (numKey >= 1 && numKey <= puzzle.options.length) {
          game.selected = numKey - 1;
          soundRef.current?.playClick();
          forceUpdate(n => n + 1);
          return;
        }
        const letterIdx = "abcde".indexOf(e.key.toLowerCase());
        if (letterIdx >= 0 && letterIdx < puzzle.options.length) {
          game.selected = letterIdx;
          soundRef.current?.playClick();
          forceUpdate(n => n + 1);
          return;
        }
        // Enter to submit
        if (e.key === "Enter" && game.selected !== null) {
          submitAnswer();
          return;
        }
      } else {
        // Enter or Space to go next
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          nextQuestion();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitAnswer, nextQuestion]);

  // ─── Tab visibility auto-pause ─────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.hidden && gameRef.current && !gameRef.current.over) {
        gameRef.current.paused = true;
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ─── Cleanup ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      soundRef.current?.dispose();
      inputRef.current?.dispose();
      particlesRef.current?.clear();
    };
  }, []);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <Link href="/games" className="text-sm text-[#8a8a8a] hover:text-white mb-3 inline-block transition">
          ← 返回游戏中心
        </Link>

        {/* Title + Stats */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">
            <span className="text-[#a855f7]">? 逻辑推理</span>
          </h1>
          <div className="flex gap-2">
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">得分</div>
              <div className="font-bold text-[#f0b90b] text-sm tabular-nums">{score}</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333]">
              <div className="text-[10px] text-[#8a8a8a]">进度</div>
              <div className="font-bold text-[#3ea6ff] text-sm tabular-nums">{answered}/{TOTAL_QUESTIONS}</div>
            </div>
            {streak > 1 && (
              <div className="text-center px-3 py-1.5 rounded-lg bg-[#ff4444]/10 border border-[#ff4444]/30">
                <div className="text-[10px] text-[#ff4444]">连击</div>
                <div className="font-bold text-[#ff4444] text-sm tabular-nums">×{streak}</div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-end mb-3 gap-1.5">
          <button
            onClick={togglePause}
            className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
          >
            {paused ? "▶" : "⏸"}
          </button>
          <button
            onClick={() => { soundRef.current?.toggleMute(); forceUpdate(n => n + 1); }}
            className="px-3 py-1.5 rounded-lg text-xs border border-[#333] text-[#aaa] hover:text-white hover:border-[#555] transition"
          >
            {soundRef.current?.isMuted() ? "?" : "?"}
          </button>
          <button
            onClick={initGame}
            className="px-3 py-1.5 rounded-lg text-xs bg-[#a855f7] text-white font-semibold hover:bg-[#c084fc] transition"
          >
            新游戏
          </button>
        </div>

        {/* Canvas */}
        <div className="w-full touch-none select-none">
          <canvas
            ref={canvasRef}
            className="w-full rounded-xl"
            style={{ touchAction: "none" }}
          />
        </div>

        {/* Game Over overlay (React) */}
        {gameOver && (
          <div className="text-center mt-3">
            <p className="text-[#8a8a8a] text-sm">键盘快捷键：A-E 选择 · Enter 提交/下一题</p>
          </div>
        )}

        <p className="text-center text-[10px] text-[#666] mt-3">
          限时{TIME_PER_QUESTION}秒 · 连续答对获得连击加分 · 共{TOTAL_QUESTIONS}题
        </p>

        {/* Leaderboard & Save/Load */}
        <div className="mt-4 space-y-3">
          <GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad} />
          <GameLeaderboard gameId={GAME_ID} />
        </div>
      </main>
    </>
  );
}
