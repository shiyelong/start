"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";
import GameLeaderboard from "@/components/GameLeaderboard";
import GameSaveLoad from "@/components/GameSaveLoad";
import { fetchWithAuth } from "@/lib/auth";
import { loadPixi, createPixiApp } from "@/lib/game-engine/pixi-wrapper";
import type { Application, Graphics as PixiGraphics } from "pixi.js";
import {
  ArrowLeft, Volume2, VolumeX, Trophy, Plus, Coins, Eye, EyeOff,
} from "lucide-react";

const GAME_ID = "zhajinhua";
const SUITS = ["spade", "heart", "diamond", "club"] as const;
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"] as const;
type Suit = (typeof SUITS)[number];
type Rank = (typeof RANKS)[number];
interface Card { suit: Suit; rank: Rank }
type HandType = "baozi"|"tonghuashun"|"tonghua"|"shunzi"|"duizi"|"sanpai";
interface Player {
  id: number; name: string; chips: number; cards: Card[];
  folded: boolean; looked: boolean; isHuman: boolean; totalBet: number;
}
interface GS {
  players: Player[]; pot: number; currentBet: number;
  currentPlayer: number; round: number; phase: "betting"|"over";
  winner: number; message: string; compareMode: boolean;
}

const HAND_NAMES: Record<HandType, string> = {
  baozi:"豹子", tonghuashun:"同花顺", tonghua:"同花",
  shunzi:"顺子", duizi:"对子", sanpai:"散牌",
};

function rankVal(r: Rank): number {
  const m: Record<string,number> = {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13,A:14};
  return m[r]??0;
}
function suitColor(s: Suit): number { return s==="heart"||s==="diamond"?0xff4444:0xffffff; }
function sortedVals(cards: Card[]): number[] { return cards.map(c=>rankVal(c.rank)).sort((a,b)=>a-b); }
function isStraight(v: number[]): boolean {
  const [a,b,c]=v; if(a===2&&b===3&&c===14) return true; return c-b===1&&b-a===1;
}
function isFlush(cards: Card[]): boolean { return cards[0].suit===cards[1].suit&&cards[1].suit===cards[2].suit; }
function getHandType(cards: Card[]): HandType {
  const v=sortedVals(cards); const fl=isFlush(cards); const st=isStraight(v);
  const [a,b,c]=v;
  if(a===b&&b===c) return "baozi";
  if(fl&&st) return "tonghuashun"; if(fl) return "tonghua";
  if(st) return "shunzi"; if(a===b||b===c) return "duizi"; return "sanpai";
}
const HR: Record<HandType,number> = { baozi:6, tonghuashun:5, tonghua:4, shunzi:3, duizi:2, sanpai:1 };
function handScore(cards: Card[]): number {
  const ht=getHandType(cards); const v=sortedVals(cards); let b=HR[ht]*1e6;
  if(ht==="duizi"){ const [a,_b,c]=v; const pv=a===_b?a:_b; const k=a===_b?c:a; b+=pv*1e4+k*100; }
  else if(ht==="shunzi"||ht==="tonghuashun"){ const [a,,c]=v; b+=(a===2&&c===14?200:c*1e4); }
  else { b+=v[2]*1e4+v[1]*100+v[0]; }
  return b;
}
function compareHands(a: Card[], b: Card[]): number { return handScore(a)-handScore(b); }

function makeDeck(): Card[] {
  const d: Card[]=[];
  for(const s of SUITS) for(const r of RANKS) d.push({suit:s,rank:r});
  for(let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]; }
  return d;
}

class ZJHSound {
  private ctx: AudioContext|null=null; private muted=false;
  private getCtx(): AudioContext { if(!this.ctx) this.ctx=new AudioContext(); return this.ctx; }
  private tone(f:number,d:number,t:OscillatorType="sine",v=0.12){
    if(this.muted)return; try{
      const c=this.getCtx(),o=c.createOscillator(),g=c.createGain();
      o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d);
      o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+d);
    }catch{}
  }
  playDeal(){[400,500,600].forEach((f,i)=>setTimeout(()=>this.tone(f,0.08,"triangle"),i*60));}
  playBet(){this.tone(800,0.06,"sine");this.tone(600,0.06,"triangle");}
  playWin(){[523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.tone(f,0.18,"triangle"),i*100));}
  playLose(){[400,350,300,250].forEach((f,i)=>setTimeout(()=>this.tone(f,0.2,"sawtooth",0.08),i*120));}
  playReveal(){this.tone(880,0.1,"sine");setTimeout(()=>this.tone(1100,0.1,"sine"),60);}
  playFold(){this.tone(200,0.15,"sawtooth",0.06);}
  toggleMute():boolean{this.muted=!this.muted;return this.muted;}
  isMuted():boolean{return this.muted;}
  dispose(){this.ctx?.close();this.ctx=null;}
}

function initGame(startChips=1000): GS {
  const deck=makeDeck();
  const names=["你","AI-东","AI-北","AI-西"];
  const players: Player[]=names.map((name,i)=>({
    id:i,name,chips:startChips-10,cards:[deck.pop()!,deck.pop()!,deck.pop()!],
    folded:false,looked:false,isHuman:i===0,totalBet:10,
  }));
  return { players,pot:40,currentBet:10,currentPlayer:0,round:1,
    phase:"betting",winner:-1,message:"游戏开始! 请选择操作",compareMode:false };
}

function nextActive(gs:GS,from:number):number{
  for(let i=1;i<=4;i++){const idx=(from+i)%4;if(!gs.players[idx].folded)return idx;}return from;
}
function activeCount(gs:GS):number{return gs.players.filter(p=>!p.folded).length;}

function aiTurn(gs:GS):void{
  const p=gs.players[gs.currentPlayer]; if(p.folded||p.isHuman)return;
  const ht=getHandType(p.cards); const hr=HR[ht];
  // AI decides to look with some probability
  if(!p.looked&&Math.random()<0.3) p.looked=true;
  const betMult=p.looked?2:1; const callAmt=gs.currentBet*betMult;
  // Fold if hand is bad and pot is high
  if(hr<=1&&gs.pot>200&&Math.random()<0.4){ p.folded=true; gs.message=`${p.name} 弃牌`; return; }
  if(hr<=2&&callAmt>p.chips*0.3&&Math.random()<0.3){ p.folded=true; gs.message=`${p.name} 弃牌`; return; }
  // Try to compare if only 2 active and hand is decent
  if(activeCount(gs)===2&&hr>=2&&gs.round>3){
    const opp=gs.players.find(o=>!o.folded&&o.id!==p.id)!;
    const result=compareHands(p.cards,opp.cards);
    if(result>0){ opp.folded=true; gs.message=`${p.name} 比牌赢了 ${opp.name}`; }
    else{ p.folded=true; gs.message=`${p.name} 比牌输给了 ${opp.name}`; }
    return;
  }
  // Raise if strong hand
  if(hr>=4&&Math.random()<0.5&&gs.currentBet<100){
    const raise=Math.min(gs.currentBet*2,p.chips);
    gs.currentBet=Math.max(gs.currentBet,raise); p.chips-=raise*betMult;
    p.totalBet+=raise*betMult; gs.pot+=raise*betMult;
    gs.message=`${p.name} 加注到 ${raise}`; return;
  }
  // Call
  const amt=Math.min(callAmt,p.chips);
  p.chips-=amt; p.totalBet+=amt; gs.pot+=amt;
  gs.message=`${p.name} 跟注 ${amt}`;
}

/* ─── PixiJS Rendering ─── */
function drawSuit(g:PixiGraphics,suit:Suit,x:number,y:number,sz:number){
  const c=suitColor(suit);
  if(suit==="heart"){
    const s=sz*0.4;
    g.moveTo(x,y+s*0.35).bezierCurveTo(x-s,y-s*0.3,x-s*0.01,y-s*0.6,x,y-s*0.1)
     .bezierCurveTo(x+s*0.01,y-s*0.6,x+s,y-s*0.3,x,y+s*0.35).fill({color:c});
  } else if(suit==="diamond"){
    const s=sz*0.35;
    g.moveTo(x,y-s).lineTo(x+s*0.6,y).lineTo(x,y+s).lineTo(x-s*0.6,y).closePath().fill({color:c});
  } else if(suit==="club"){
    const r=sz*0.12;
    g.circle(x,y-r*0.8,r).fill({color:c});
    g.circle(x-r,y+r*0.2,r).fill({color:c});
    g.circle(x+r,y+r*0.2,r).fill({color:c});
    g.rect(x-1.5,y+r*0.2,3,r*1.5).fill({color:c});
  } else { // spade
    const s=sz*0.35;
    g.moveTo(x,y-s).lineTo(x+s*0.5,y+s*0.15).quadraticCurveTo(x+s*0.1,y+s*0.3,x+s*0.15,y+s*0.5)
     .lineTo(x-s*0.15,y+s*0.5).quadraticCurveTo(x-s*0.1,y+s*0.3,x-s*0.5,y+s*0.15).closePath().fill({color:c});
    g.rect(x-1.5,y+s*0.3,3,s*0.5).fill({color:c});
  }
}

function renderTable(g:PixiGraphics,gs:GS,W:number,H:number){
  g.clear();
  // Dark felt table
  g.rect(0,0,W,H).fill({color:0x0f0f0f});
  g.ellipse(W/2,H/2,W*0.44,H*0.40).fill({color:0x0a3a0a});
  g.ellipse(W/2,H/2,W*0.44,H*0.40).stroke({color:0x1a6a1a,width:2.5});
  g.ellipse(W/2,H/2,W*0.42,H*0.38).stroke({color:0x145014,width:1});

  // Positions: 0=bottom(player), 1=right, 2=top, 3=left
  const pos=[
    {x:W/2,y:H-55},{x:W-70,y:H/2},{x:W/2,y:55},{x:70,y:H/2},
  ];

  gs.players.forEach((p,i)=>{
    const {x,y}=pos[i];
    const isActive=gs.currentPlayer===i&&gs.phase==="betting";
    // Active player glow
    if(isActive&&!p.folded){
      g.roundRect(x-52,y-40,104,80,8).stroke({color:0x3ea6ff,width:2,alpha:0.7});
    }
    // Chip indicator dot
    if(!p.folded){
      g.circle(x,y-32,3).fill({color:0xf0b90b});
    }
    // Cards
    const cw=28,ch=40,gap=31;
    const sx=x-gap;
    if(!p.folded){
      const show=(p.isHuman&&p.looked)||gs.phase==="over";
      for(let ci=0;ci<3;ci++){
        const cx=sx+ci*gap-cw/2, cy=y-8;
        if(show){
          g.roundRect(cx,cy,cw,ch,3).fill({color:0xfafafa});
          g.roundRect(cx,cy,cw,ch,3).stroke({color:0xcccccc,width:0.5});
          const card=p.cards[ci];
          drawSuit(g,card.suit,cx+cw/2,cy+ch*0.65,cw);
        } else {
          g.roundRect(cx,cy,cw,ch,3).fill({color:0x2244aa});
          g.roundRect(cx+3,cy+3,cw-6,ch-6,2).stroke({color:0x3366cc,width:0.8});
        }
      }
    } else {
      // Folded — dim cards
      for(let ci=0;ci<3;ci++){
        const cx=sx+ci*gap-cw/2, cy=y-8;
        g.roundRect(cx,cy,cw,ch,3).fill({color:0x333333,alpha:0.4});
      }
    }
  });

  // Center pot glow
  g.circle(W/2,H/2,30).fill({color:0xf0b90b,alpha:0.08});
}

/* ─── Main Component ─── */
export default function ZhaJinHuaPage(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [screen,setScreen]=useState<"title"|"playing"|"over">("title");
  const [score,setScore]=useState(0);
  const [muted,setMuted]=useState(false);
  const [showLB,setShowLB]=useState(false);
  const [showSave,setShowSave]=useState(false);
  const [totalWins,setTotalWins]=useState(0);

  const gsRef=useRef<GS|null>(null);
  const soundRef=useRef<ZJHSound|null>(null);
  const pixiAppRef=useRef<Application|null>(null);
  const pixiGfxRef=useRef<PixiGraphics|null>(null);
  const destroyedRef=useRef(false);
  const rafRef=useRef(0);
  const screenRef=useRef(screen);

  // Overlay state driven by game state
  const [msg,setMsg]=useState("");
  const [playerInfo,setPlayerInfo]=useState<{name:string;chips:number;looked:boolean;folded:boolean}[]>([]);
  const [pot,setPot]=useState(0);
  const [curBet,setCurBet]=useState(10);
  const [isMyTurn,setIsMyTurn]=useState(false);
  const [myLooked,setMyLooked]=useState(false);
  const [phase,setPhase]=useState<"betting"|"over">("betting");
  const [compareMode,setCompareMode]=useState(false);
  const [myCards,setMyCards]=useState<Card[]>([]);

  useEffect(()=>{screenRef.current=screen;},[screen]);

  // Sound init
  useEffect(()=>{
    soundRef.current=new ZJHSound();
    return()=>{soundRef.current?.dispose();};
  },[]);

  // Load progress
  useEffect(()=>{
    try{ const s=localStorage.getItem("zjh-wins"); if(s) setTotalWins(parseInt(s)||0); }catch{}
  },[]);

  const syncUI=useCallback(()=>{
    const gs=gsRef.current; if(!gs)return;
    setMsg(gs.message);
    setPlayerInfo(gs.players.map(p=>({name:p.name,chips:p.chips,looked:p.looked,folded:p.folded})));
    setPot(gs.pot); setCurBet(gs.currentBet);
    setIsMyTurn(gs.currentPlayer===0&&gs.phase==="betting"&&!gs.players[0].folded);
    setMyLooked(gs.players[0].looked);
    setPhase(gs.phase);
    setMyCards(gs.players[0].cards);
  },[]);

  const checkWinner=useCallback(()=>{
    const gs=gsRef.current; if(!gs)return;
    const alive=gs.players.filter(p=>!p.folded);
    if(alive.length===1){
      gs.phase="over"; gs.winner=alive[0].id;
      alive[0].chips+=gs.pot;
      const ht=getHandType(alive[0].cards);
      gs.message=`${alive[0].name} 获胜! (${HAND_NAMES[ht]}) 赢得 ${gs.pot} 筹码`;
      if(alive[0].isHuman){
        soundRef.current?.playWin();
        const sc=gs.pot+gs.round*10;
        setScore(sc); setTotalWins(w=>{const nw=w+1;try{localStorage.setItem("zjh-wins",""+nw);}catch{}return nw;});
        fetchWithAuth("/api/games/scores",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({game_id:GAME_ID,score:sc})}).catch(()=>{});
      } else { soundRef.current?.playLose(); }
      setScreen("over"); syncUI(); return true;
    }
    // Auto-end after many rounds
    if(gs.round>20&&alive.length>1){
      let best=alive[0];
      for(const p of alive){ if(compareHands(p.cards,best.cards)>0) best=p; }
      gs.phase="over"; gs.winner=best.id; best.chips+=gs.pot;
      const ht=getHandType(best.cards);
      gs.message=`${best.name} 获胜! (${HAND_NAMES[ht]})`;
      if(best.isHuman){ soundRef.current?.playWin(); const sc=gs.pot+gs.round*10; setScore(sc);
        fetchWithAuth("/api/games/scores",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({game_id:GAME_ID,score:sc})}).catch(()=>{});
      } else { soundRef.current?.playLose(); }
      setScreen("over"); syncUI(); return true;
    }
    return false;
  },[syncUI]);

  const advanceTurn=useCallback(()=>{
    const gs=gsRef.current; if(!gs||gs.phase==="over")return;
    gs.currentPlayer=nextActive(gs,gs.currentPlayer);
    // Check if we completed a round
    if(gs.currentPlayer===nextActive(gs,-1)){/* first active */}
    gs.round++;
    if(checkWinner())return;
    // If it's AI turn, auto-play with delay
    if(!gs.players[gs.currentPlayer].isHuman){
      syncUI();
      setTimeout(()=>{
        if(destroyedRef.current)return;
        const gs2=gsRef.current; if(!gs2||gs2.phase==="over")return;
        aiTurn(gs2);
        soundRef.current?.playBet();
        if(!checkWinner()) advanceTurn();
        else syncUI();
      },600+Math.random()*400);
    } else { syncUI(); }
  },[checkWinner,syncUI]);

  /* ─── Player Actions ─── */
  const doLook=useCallback(()=>{
    const gs=gsRef.current; if(!gs||!isMyTurn)return;
    gs.players[0].looked=true; gs.message="你看了牌 (下注翻倍)";
    soundRef.current?.playReveal(); syncUI();
  },[isMyTurn,syncUI]);

  const doCall=useCallback(()=>{
    const gs=gsRef.current; if(!gs||!isMyTurn)return;
    const p=gs.players[0]; const mult=p.looked?2:1;
    const amt=Math.min(gs.currentBet*mult,p.chips);
    p.chips-=amt; p.totalBet+=amt; gs.pot+=amt;
    gs.message=`你跟注 ${amt}`; soundRef.current?.playBet();
    advanceTurn();
  },[isMyTurn,advanceTurn]);

  const doRaise=useCallback(()=>{
    const gs=gsRef.current; if(!gs||!isMyTurn)return;
    const p=gs.players[0]; const mult=p.looked?2:1;
    const newBet=Math.min(gs.currentBet*2,200);
    const amt=Math.min(newBet*mult,p.chips);
    gs.currentBet=newBet; p.chips-=amt; p.totalBet+=amt; gs.pot+=amt;
    gs.message=`你加注到 ${newBet}`; soundRef.current?.playBet();
    advanceTurn();
  },[isMyTurn,advanceTurn]);

  const doFold=useCallback(()=>{
    const gs=gsRef.current; if(!gs||!isMyTurn)return;
    gs.players[0].folded=true; gs.message="你弃牌了";
    soundRef.current?.playFold(); checkWinner(); if(gsRef.current?.phase!=="over") advanceTurn();
  },[isMyTurn,advanceTurn,checkWinner]);

  const doCompare=useCallback((targetId:number)=>{
    const gs=gsRef.current; if(!gs||!isMyTurn)return;
    const p=gs.players[0]; const t=gs.players[targetId];
    if(t.folded||targetId===0)return;
    // Pay compare cost
    const mult=p.looked?2:1; const amt=Math.min(gs.currentBet*mult,p.chips);
    p.chips-=amt; p.totalBet+=amt; gs.pot+=amt;
    const result=compareHands(p.cards,t.cards);
    if(result>=0){ t.folded=true; gs.message=`你比牌赢了 ${t.name}!`; soundRef.current?.playWin(); }
    else{ p.folded=true; gs.message=`你比牌输给了 ${t.name}`; soundRef.current?.playLose(); }
    setCompareMode(false);
    if(!checkWinner()) advanceTurn();
  },[isMyTurn,advanceTurn,checkWinner]);

  const startGame=useCallback(()=>{
    gsRef.current=initGame(1000);
    soundRef.current?.playDeal();
    setScreen("playing"); setScore(0); setCompareMode(false);
    syncUI();
    // If AI goes first (shouldn't since player is 0, but safety)
    const gs=gsRef.current;
    if(gs&&!gs.players[gs.currentPlayer].isHuman){
      setTimeout(()=>{ if(!destroyedRef.current){ aiTurn(gs); if(!checkWinner()) advanceTurn(); } },800);
    }
  },[syncUI,advanceTurn,checkWinner]);

  const newRound=useCallback(()=>{
    const gs=gsRef.current; if(!gs)return;
    // Keep chips, deal new cards
    const deck=makeDeck();
    gs.players.forEach(p=>{
      if(p.chips<10){ p.chips=500; } // Rebuy for broke players
      p.cards=[deck.pop()!,deck.pop()!,deck.pop()!];
      p.folded=false; p.looked=false; p.totalBet=10; p.chips-=10;
    });
    gs.pot=40; gs.currentBet=10; gs.currentPlayer=0;
    gs.round=1; gs.phase="betting"; gs.winner=-1;
    gs.message="新一局! 请选择操作"; gs.compareMode=false;
    soundRef.current?.playDeal();
    setScreen("playing"); setCompareMode(false);
    syncUI();
  },[syncUI]);

  /* ─── Save / Load ─── */
  const handleSave=useCallback(()=>{
    const gs=gsRef.current; if(!gs)return null;
    return { players:gs.players.map(p=>({...p})), pot:gs.pot, currentBet:gs.currentBet,
      currentPlayer:gs.currentPlayer, round:gs.round, phase:gs.phase,
      winner:gs.winner, message:gs.message, totalWins, score };
  },[totalWins,score]);

  const handleLoad=useCallback((data:unknown)=>{
    const d=data as Record<string,unknown>; if(!d||!d.players)return;
    gsRef.current={
      players:(d.players as Player[]).map(p=>({...p})),
      pot:d.pot as number, currentBet:d.currentBet as number,
      currentPlayer:d.currentPlayer as number, round:d.round as number,
      phase:d.phase as "betting"|"over", winner:d.winner as number,
      message:d.message as string, compareMode:false,
    };
    if(d.totalWins) setTotalWins(d.totalWins as number);
    if(d.score) setScore(d.score as number);
    setScreen(gsRef.current.phase==="over"?"over":"playing");
    syncUI();
  },[syncUI]);

  /* ─── PixiJS Init & Render Loop ─── */
  useEffect(()=>{
    if(screenRef.current==="title")return;
    let destroyed=false; destroyedRef.current=false;
    let app: Application|null=null;
    let gfx: PixiGraphics|null=null;

    const init=async()=>{
      if(!canvasRef.current||destroyed)return;
      const pixi=await loadPixi();
      if(destroyed)return;
      const rect=canvasRef.current.parentElement!.getBoundingClientRect();
      const W=Math.min(rect.width,600); const H=Math.min(W*0.75,450);
      app=await createPixiApp({canvas:canvasRef.current,width:W,height:H,backgroundColor:0x0f0f0f});
      if(destroyed){app.destroy();return;}
      pixiAppRef.current=app;
      gfx=new pixi.Graphics(); app.stage.addChild(gfx);
      pixiGfxRef.current=gfx;

      const loop=()=>{
        if(destroyed)return;
        const gs=gsRef.current;
        if(gs&&gfx) renderTable(gfx,gs,W,H);
        rafRef.current=requestAnimationFrame(loop);
      };
      rafRef.current=requestAnimationFrame(loop);
    };
    init();

    return()=>{
      destroyed=true; destroyedRef.current=true;
      cancelAnimationFrame(rafRef.current);
      if(gfx){try{gfx.destroy();}catch{}} pixiGfxRef.current=null;
      if(app){try{app.destroy();}catch{}} pixiAppRef.current=null;
    };
  },[screen]);

  /* ─── Render ─── */
  const myHand=myLooked&&myCards.length===3?getHandType(myCards):null;

  if(screen==="title"){
    return(
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Header/>
        <div className="max-w-lg mx-auto px-4 pt-6 pb-20">
          <Link href="/games" className="inline-flex items-center gap-1.5 text-[#3ea6ff] text-sm mb-6 hover:underline">
            <ArrowLeft size={16}/> 返回游戏
          </Link>
          <h1 className="text-2xl font-bold mb-2">炸金花</h1>
          <p className="text-[#aaa] text-sm mb-6">经典三张牌比大小，斗智斗勇的博弈游戏</p>

          <div className="space-y-3 mb-6">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4">
              <h3 className="text-sm font-bold text-[#3ea6ff] mb-2">牌型大小</h3>
              <div className="text-xs text-[#aaa] space-y-1">
                <p>豹子 &gt; 同花顺 &gt; 同花 &gt; 顺子 &gt; 对子 &gt; 散牌</p>
                <p>特殊: A23 是最小的顺子</p>
              </div>
            </div>
            <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-4">
              <h3 className="text-sm font-bold text-[#3ea6ff] mb-2">操作说明</h3>
              <div className="text-xs text-[#aaa] space-y-1">
                <p>看牌: 查看自己的牌 (之后下注翻倍)</p>
                <p>跟注: 跟当前注额 / 加注: 翻倍当前注额</p>
                <p>比牌: 选择一个对手比较牌面大小</p>
                <p>弃牌: 放弃本局</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-[#aaa]">
              <Trophy size={14} className="text-[#f0b90b]"/> 总胜场: {totalWins}
            </div>
          </div>

          <button onClick={startGame}
            className="w-full py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-lg hover:bg-[#5bb8ff] transition">
            开始游戏
          </button>

          <div className="mt-6 space-y-3">
            <button onClick={()=>setShowLB(!showLB)}
              className="flex items-center gap-2 text-sm text-[#3ea6ff] hover:underline">
              <Trophy size={14}/> {showLB?"隐藏排行榜":"查看排行榜"}
            </button>
            {showLB&&<GameLeaderboard gameId={GAME_ID}/>}
          </div>
        </div>
      </div>
    );
  }

  return(
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header/>
      <div className="max-w-2xl mx-auto px-2 pt-2 pb-20">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-2">
          <Link href="/games" className="inline-flex items-center gap-1 text-[#3ea6ff] text-xs hover:underline">
            <ArrowLeft size={14}/> 返回
          </Link>
          <div className="flex items-center gap-3">
            <button onClick={()=>setShowSave(!showSave)} className="text-[#aaa] hover:text-white">
              <Plus size={16}/>
            </button>
            <button onClick={()=>setShowLB(!showLB)} className="text-[#aaa] hover:text-white">
              <Trophy size={16}/>
            </button>
            <button onClick={()=>{const m=soundRef.current?.toggleMute();setMuted(!!m);}}
              className="text-[#aaa] hover:text-white">
              {muted?<VolumeX size={16}/>:<Volume2 size={16}/>}
            </button>
          </div>
        </div>

        {showSave&&<div className="mb-3"><GameSaveLoad gameId={GAME_ID} onSave={handleSave} onLoad={handleLoad}/></div>}
        {showLB&&<div className="mb-3"><GameLeaderboard gameId={GAME_ID}/></div>}

        {/* Canvas */}
        <div className="relative w-full rounded-xl overflow-hidden border border-[#333]"
          style={{maxWidth:600,aspectRatio:"4/3",margin:"0 auto"}}>
          <canvas ref={canvasRef} className="w-full h-full block"/>

          {/* Text overlay for player info */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Center: pot & message */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="flex items-center justify-center gap-1 text-[#f0b90b] text-sm font-bold">
                <Coins size={14}/> {pot}
              </div>
              <div className="text-[10px] text-[#aaa]">当前注: {curBet}</div>
              <div className="text-[11px] text-[#3ea6ff] mt-1 max-w-[200px]">{msg}</div>
            </div>

            {/* Player labels at 4 positions */}
            {playerInfo.map((p,i)=>{
              const posStyles=[
                "bottom-1 left-1/2 -translate-x-1/2",
                "right-1 top-1/2 -translate-y-1/2 text-right",
                "top-1 left-1/2 -translate-x-1/2",
                "left-1 top-1/2 -translate-y-1/2",
              ];
              return(
                <div key={i} className={`absolute ${posStyles[i]} px-2 py-0.5`}>
                  <div className={`text-[10px] font-bold ${p.folded?"text-[#555]":"text-[#ccc]"}`}>{p.name}</div>
                  <div className="text-[9px] text-[#f0b90b]">{p.chips}</div>
                  {p.looked&&!p.folded&&<div className="text-[8px] text-[#ff8800]">已看牌</div>}
                  {p.folded&&<div className="text-[8px] text-[#555]">弃牌</div>}
                </div>
              );
            })}

            {/* Show player's cards as text when looked */}
            {myLooked&&phase==="betting"&&!playerInfo[0]?.folded&&(
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-1">
                {myCards.map((c,i)=>(
                  <span key={i} className="text-[10px] px-1 py-0.5 rounded bg-black/60"
                    style={{color:c.suit==="heart"||c.suit==="diamond"?"#ff4444":"#fff"}}>
                    {c.rank}
                  </span>
                ))}
                {myHand&&<span className="text-[10px] text-[#3ea6ff] ml-1">{HAND_NAMES[myHand]}</span>}
              </div>
            )}

            {/* Show all hands when game over */}
            {phase==="over"&&(
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2 flex-wrap justify-center">
                {gsRef.current?.players.map((p,i)=>{
                  const ht=getHandType(p.cards);
                  return(
                    <div key={i} className="text-[9px] bg-black/70 rounded px-1.5 py-0.5">
                      <span className="text-[#aaa]">{p.name}: </span>
                      <span className="text-[#3ea6ff]">{HAND_NAMES[ht]}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        {phase==="betting"&&isMyTurn&&!compareMode&&(
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            {!myLooked&&(
              <button onClick={doLook}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm hover:border-[#3ea6ff] transition">
                <Eye size={14} className="text-[#3ea6ff]"/> 看牌
              </button>
            )}
            <button onClick={doCall}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm hover:border-[#3ea6ff] transition">
              <Coins size={14} className="text-[#f0b90b]"/> 跟注 ({curBet*(myLooked?2:1)})
            </button>
            <button onClick={doRaise}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm hover:border-[#f0b90b] transition">
              <Plus size={14} className="text-[#f0b90b]"/> 加注
            </button>
            <button onClick={()=>setCompareMode(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm hover:border-[#ff4444] transition">
              <EyeOff size={14} className="text-[#ff4444]"/> 比牌
            </button>
            <button onClick={doFold}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm text-[#666] hover:border-[#666] transition">
              弃牌
            </button>
          </div>
        )}

        {/* Compare mode: pick target */}
        {compareMode&&isMyTurn&&(
          <div className="mt-3 text-center">
            <p className="text-sm text-[#3ea6ff] mb-2">选择比牌对手:</p>
            <div className="flex gap-2 justify-center">
              {playerInfo.slice(1).map((p,i)=>{
                const idx=i+1;
                if(p.folded)return null;
                return(
                  <button key={idx} onClick={()=>doCompare(idx)}
                    className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#ff4444] text-sm hover:bg-[#ff4444]/20 transition pointer-events-auto">
                    {p.name}
                  </button>
                );
              })}
              <button onClick={()=>setCompareMode(false)}
                className="px-4 py-2 rounded-lg bg-[#1a1a1a] border border-[#333] text-sm text-[#666] hover:border-[#666] transition pointer-events-auto">
                取消
              </button>
            </div>
          </div>
        )}

        {/* Waiting for AI */}
        {phase==="betting"&&!isMyTurn&&!playerInfo[0]?.folded&&(
          <div className="text-center mt-3 text-sm text-[#666]">等待对手操作...</div>
        )}

        {/* Game over */}
        {phase==="over"&&(
          <div className="text-center mt-4 space-y-3">
            <div className="text-lg font-bold">
              {gsRef.current?.winner===0?(
                <span className="text-[#f0b90b]">你赢了! +{score}分</span>
              ):(
                <span className="text-[#ff4444]">{gsRef.current?.players[gsRef.current.winner]?.name} 获胜</span>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={newRound}
                className="px-6 py-2 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold hover:bg-[#5bb8ff] transition">
                下一局
              </button>
              <button onClick={()=>{setScreen("title");gsRef.current=null;}}
                className="px-6 py-2 rounded-xl bg-[#1a1a1a] border border-[#333] hover:border-[#3ea6ff] transition">
                返回标题
              </button>
            </div>
          </div>
        )}

        {/* Player folded but game continues */}
        {phase==="betting"&&playerInfo[0]?.folded&&(
          <div className="text-center mt-3 text-sm text-[#666]">你已弃牌，等待本局结束...</div>
        )}
      </div>
    </div>
  );
}
