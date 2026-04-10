"use client";
import { useState, useCallback } from "react";
import Header from "@/components/Header";
import clsx from "clsx";

interface Pet { name: string; emoji: string; hp: number; maxHp: number; atk: number; def: number; spd: number; skills: Skill[]; type: "fire" | "water" | "grass" | "dark"; }
interface Skill { name: string; power: number; type: "fire" | "water" | "grass" | "dark" | "normal"; cost: number; effect?: "heal" | "buff" | "debuff"; }

const TYPE_CHART: Record<string, string[]> = { fire: ["grass"], water: ["fire"], grass: ["water"], dark: ["grass", "water", "fire"] };
const TYPE_COLORS: Record<string, string> = { fire: "#ff4444", water: "#3ea6ff", grass: "#2ba640", dark: "#a855f7", normal: "#aaa" };

const ALL_PETS: Pet[] = [
  { name: "炎龙", emoji: "🐉", hp: 120, maxHp: 120, atk: 35, def: 15, spd: 20, type: "fire", skills: [
    { name: "火焰吐息", power: 40, type: "fire", cost: 0 }, { name: "龙之怒", power: 65, type: "fire", cost: 1 }, { name: "烈焰风暴", power: 90, type: "fire", cost: 2 },
  ]},
  { name: "海灵", emoji: "🐋", hp: 140, maxHp: 140, atk: 28, def: 22, spd: 18, type: "water", skills: [
    { name: "水枪", power: 35, type: "water", cost: 0 }, { name: "潮汐冲击", power: 60, type: "water", cost: 1 }, { name: "海啸", power: 85, type: "water", cost: 2 },
  ]},
  { name: "藤蔓兽", emoji: "🌿", hp: 130, maxHp: 130, atk: 30, def: 20, spd: 22, type: "grass", skills: [
    { name: "藤鞭", power: 35, type: "grass", cost: 0 }, { name: "寄生种子", power: 50, type: "grass", cost: 1, effect: "heal" }, { name: "日光束", power: 90, type: "grass", cost: 2 },
  ]},
  { name: "暗影狼", emoji: "🐺", hp: 110, maxHp: 110, atk: 40, def: 12, spd: 30, type: "dark", skills: [
    { name: "暗影爪", power: 38, type: "dark", cost: 0 }, { name: "噩梦", power: 55, type: "dark", cost: 1, effect: "debuff" }, { name: "深渊吞噬", power: 95, type: "dark", cost: 2 },
  ]},
];

export default function PetBattlePage() {
  const [phase, setPhase] = useState<"select" | "battle" | "win" | "lose">("select");
  const [myPet, setMyPet] = useState<Pet | null>(null);
  const [enemyPet, setEnemyPet] = useState<Pet | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [energy, setEnergy] = useState(0);
  const [, setTurn] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [wins, setWins] = useState(0);

  const selectPet = useCallback((pet: Pet) => {
    const p = { ...pet, hp: pet.maxHp };
    setMyPet(p);
    // Random enemy (different from player)
    const others = ALL_PETS.filter(op => op.name !== pet.name);
    const enemy = { ...others[Math.floor(Math.random() * others.length)], hp: 0, maxHp: 0, atk: 0, def: 0, spd: 0, skills: [] as Skill[] };
    const base = others[Math.floor(Math.random() * others.length)];
    const lvl = 1 + wins * 0.3;
    Object.assign(enemy, { ...base, hp: Math.floor(base.maxHp * lvl), maxHp: Math.floor(base.maxHp * lvl), atk: Math.floor(base.atk * lvl), def: Math.floor(base.def * lvl) });
    setEnemyPet(enemy);
    setLog(["⚔️ 战斗开始！"]);
    setEnergy(0);
    setTurn(0);
    setPhase("battle");
  }, [wins]);

  const calcDamage = (attacker: Pet, defender: Pet, skill: Skill) => {
    let dmg = Math.max(1, Math.floor((attacker.atk * skill.power / 50) - defender.def * 0.5));
    if (TYPE_CHART[skill.type]?.includes(defender.type)) dmg = Math.floor(dmg * 1.5);
    return dmg + Math.floor(Math.random() * 5);
  };

  const activateSkill = useCallback((skillIdx: number) => {
    if (!myPet || !enemyPet || animating) return;
    const skill = myPet.skills[skillIdx];
    if (skill.cost > energy) return;
    setAnimating(true);
    const newLog = [...log];
    const newEnergy = energy - skill.cost;

    // Player attack
    const dmg = calcDamage(myPet, enemyPet, skill);
    const newEnemyHp = Math.max(0, enemyPet.hp - dmg);
    const isSuper = TYPE_CHART[skill.type]?.includes(enemyPet.type);
    newLog.push(`🎯 ${myPet.name} 使用 ${skill.name}！造成 ${dmg} 伤害${isSuper ? "（克制！）" : ""}`);
    if (skill.effect === "heal") { const heal = Math.floor(dmg * 0.5); myPet.hp = Math.min(myPet.maxHp, myPet.hp + heal); newLog.push(`💚 ${myPet.name} 回复了 ${heal} HP`); }

    const updatedEnemy = { ...enemyPet, hp: newEnemyHp };
    setEnemyPet(updatedEnemy);

    if (newEnemyHp <= 0) {
      newLog.push(`🏆 ${enemyPet.name} 被击败了！你赢了！`);
      setLog(newLog);
      setWins(w => w + 1);
      setTimeout(() => { setPhase("win"); setAnimating(false); }, 800);
      return;
    }

    // Enemy attack (after delay)
    setTimeout(() => {
      const eSkills = updatedEnemy.skills.filter(s => s.cost === 0 || Math.random() < 0.3);
      const eSkill = eSkills[Math.floor(Math.random() * eSkills.length)] || updatedEnemy.skills[0];
      const eDmg = calcDamage(updatedEnemy, myPet, eSkill);
      const newMyHp = Math.max(0, myPet.hp - eDmg);
      newLog.push(`💥 ${updatedEnemy.name} 使用 ${eSkill.name}！造成 ${eDmg} 伤害`);

      const updatedMy = { ...myPet, hp: newMyHp };
      setMyPet(updatedMy);

      if (newMyHp <= 0) {
        newLog.push(`💀 ${myPet.name} 倒下了...你输了`);
        setLog(newLog);
        setTimeout(() => { setPhase("lose"); setAnimating(false); }, 800);
        return;
      }

      setLog(newLog);
      setEnergy(Math.min(3, newEnergy + 1));
      setTurn(t => t + 1);
      setAnimating(false);
    }, 600);
  }, [myPet, enemyPet, energy, log, animating]);

  return (
    <>
      <Header />
      <main className="max-w-lg mx-auto px-4 py-4 pb-20 md:pb-8">
        <h1 className="text-xl font-bold mb-2 text-center"><i className="fas fa-dragon mr-2 text-[#a855f7]" />宠物对战</h1>

        {phase === "select" && (
          <div>
            <p className="text-center text-[#8a8a8a] text-sm mb-4">选择你的宠物出战{wins > 0 ? `（已胜 ${wins} 场）` : ""}</p>
            <div className="grid grid-cols-2 gap-3">
              {ALL_PETS.map(pet => (
                <button key={pet.name} onClick={() => selectPet(pet)}
                  className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff]/30 transition text-left active:scale-95">
                  <div className="text-3xl mb-2">{pet.emoji}</div>
                  <h3 className="font-bold text-sm" style={{ color: TYPE_COLORS[pet.type] }}>{pet.name}</h3>
                  <div className="text-[11px] text-[#8a8a8a] mt-1 space-y-0.5">
                    <p>❤️ {pet.maxHp} ⚔️ {pet.atk} 🛡️ {pet.def} ⚡ {pet.spd}</p>
                    <p>技能：{pet.skills.map(s => s.name).join("、")}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "battle" && myPet && enemyPet && (
          <div>
            {/* 敌方 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333] mb-3">
              <span className="text-3xl">{enemyPet.emoji}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm" style={{ color: TYPE_COLORS[enemyPet.type] }}>{enemyPet.name}</span>
                  <span className="text-[11px] text-[#8a8a8a]">{enemyPet.hp}/{enemyPet.maxHp}</span>
                </div>
                <div className="h-2 bg-[#333] rounded-full overflow-hidden">
                  <div className="h-full bg-[#ff4444] transition-all duration-300 rounded-full" style={{ width: `${(enemyPet.hp / enemyPet.maxHp) * 100}%` }} />
                </div>
              </div>
            </div>
            {/* 我方 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#3ea6ff]/20 mb-3">
              <span className="text-3xl">{myPet.emoji}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm" style={{ color: TYPE_COLORS[myPet.type] }}>{myPet.name}</span>
                  <span className="text-[11px] text-[#8a8a8a]">{myPet.hp}/{myPet.maxHp}</span>
                </div>
                <div className="h-2 bg-[#333] rounded-full overflow-hidden">
                  <div className="h-full bg-[#2ba640] transition-all duration-300 rounded-full" style={{ width: `${(myPet.hp / myPet.maxHp) * 100}%` }} />
                </div>
                <div className="flex gap-1 mt-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={clsx("w-4 h-4 rounded-full border", i < energy ? "bg-[#f0b90b] border-[#f0b90b]" : "bg-[#212121] border-[#333]")} />
                  ))}
                  <span className="text-[10px] text-[#8a8a8a] ml-1">能量</span>
                </div>
              </div>
            </div>
            {/* 技能 */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {myPet.skills.map((s, i) => (
                <button key={i} onClick={() => activateSkill(i)} disabled={animating || s.cost > energy}
                  className={clsx("p-2.5 rounded-xl border text-center transition active:scale-95",
                    s.cost > energy || animating ? "opacity-40 border-[#333] bg-[#1a1a1a]" : "border-[#333] bg-[#1a1a1a] hover:border-[#3ea6ff]/30"
                  )}>
                  <div className="text-xs font-bold" style={{ color: TYPE_COLORS[s.type] }}>{s.name}</div>
                  <div className="text-[10px] text-[#666]">威力{s.power} {s.cost > 0 ? `· ${s.cost}能量` : "· 免费"}</div>
                </button>
              ))}
            </div>
            {/* 战斗日志 */}
            <div className="h-32 overflow-y-auto rounded-xl bg-[#0a0a0a] border border-[#333] p-3 text-[12px] text-[#8a8a8a] space-y-1">
              {log.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          </div>
        )}

        {(phase === "win" || phase === "lose") && (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">{phase === "win" ? "🏆" : "💀"}</p>
            <p className="text-xl font-bold mb-2" style={{ color: phase === "win" ? "#2ba640" : "#ff4444" }}>
              {phase === "win" ? "胜利！" : "战败..."}
            </p>
            <p className="text-[#8a8a8a] text-sm mb-4">连胜 {wins} 场</p>
            <button onClick={() => setPhase("select")} className="px-6 py-2.5 rounded-xl bg-[#a855f7] text-white font-bold hover:bg-[#a855f7]/80 transition active:scale-95">
              {phase === "win" ? "继续挑战" : "重新选择"}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
