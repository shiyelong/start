"use client";
import { useState, useEffect, useRef } from "react";
import { generateVerifyQRData, isMobile, type ContentType } from "@/lib/content-verify";

/**
 * PC端二维码验证组件
 * - PC端显示二维码，让手机扫描
 * - 手机端直接跳转到验证流程
 */

interface QRVerifyProps {
  contentId: number;
  contentType: ContentType;
  contentTitle: string;
  onMobileVerify?: () => void; // 移动端直接验证回调
  onClose: () => void;
}

// 简易QR码生成（使用Canvas绘制，无需外部库）
function generateQRMatrix(data: string): boolean[][] {
  // 简化版：实际项目中应使用 qrcode 库
  // 这里用一个确定性的伪QR码模式来展示UI
  const size = 25;
  const matrix: boolean[][] = [];
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }

  for (let y = 0; y < size; y++) {
    matrix[y] = [];
    for (let x = 0; x < size; x++) {
      // 定位图案（三个角）
      const isFinderPattern =
        (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
      const isFinderBorder =
        isFinderPattern && (x === 0 || x === 6 || y === 0 || y === 6 ||
          x === size - 7 || x === size - 1 || y === size - 7 || y === size - 1);
      const isFinderInner =
        isFinderPattern && x >= 2 && x <= 4 && y >= 2 && y <= 4 ||
        isFinderPattern && x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4 ||
        isFinderPattern && x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3;

      if (isFinderBorder || isFinderInner) {
        matrix[y][x] = true;
      } else if (isFinderPattern) {
        const innerX = x % 7;
        const innerY = y % 7;
        matrix[y][x] = innerX === 0 || innerX === 6 || innerY === 0 || innerY === 6 ||
          (innerX >= 2 && innerX <= 4 && innerY >= 2 && innerY <= 4);
      } else {
        // 数据区域用hash生成伪随机模式
        const seed = (hash + x * 31 + y * 37 + x * y * 13) & 0xFFFF;
        matrix[y][x] = seed % 3 !== 0;
      }
    }
  }
  return matrix;
}

export default function QRVerify({ contentId, contentType, contentTitle, onMobileVerify, onClose }: QRVerifyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mobile] = useState(() => isMobile());
  const [countdown, setCountdown] = useState(300); // 5分钟有效期
  const [scanned, setScanned] = useState(false);

  const qrData = generateVerifyQRData(contentId, contentType);

  // 绘制QR码
  useEffect(() => {
    if (mobile || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const matrix = generateQRMatrix(qrData);
    const size = matrix.length;
    const cellSize = 8;
    const padding = 16;
    canvas.width = size * cellSize + padding * 2;
    canvas.height = size * cellSize + padding * 2;

    // 背景
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制模块
    ctx.fillStyle = "#000000";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (matrix[y][x]) {
          ctx.fillRect(padding + x * cellSize, padding + y * cellSize, cellSize, cellSize);
        }
      }
    }

    // 中心logo
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(centerX - 16, centerY - 16, 32, 32);
    ctx.fillStyle = "#3ea6ff";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", centerX, centerY);
  }, [qrData, mobile]);

  // 倒计时
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 0) { clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 模拟扫描检测（实际项目中通过WebSocket/轮询）
  useEffect(() => {
    if (mobile) return;
    const checkInterval = setInterval(() => {
      // 实际项目中这里会轮询服务器检查是否已扫描
    }, 3000);
    return () => clearInterval(checkInterval);
  }, [mobile]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // 移动端直接进入验证流程
  if (mobile) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={onClose}>
        <div className="w-full max-w-md bg-[#141414] border border-[#333] rounded-t-2xl md:rounded-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[#3ea6ff]/15 flex items-center justify-center mx-auto mb-3">
              
            </div>
            <h3 className="font-bold text-lg mb-1">移动端验证</h3>
            <p className="text-sm text-[#8a8a8a]">验证「{contentTitle}」</p>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
              <div className="w-8 h-8 rounded-full bg-[#3ea6ff]/15 flex items-center justify-center shrink-0">
                
              </div>
              <div>
                <p className="text-sm font-medium">定位验证</p>
                <p className="text-[11px] text-[#8a8a8a]">需要在目标地址1km范围内</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
              <div className="w-8 h-8 rounded-full bg-[#f0b90b]/15 flex items-center justify-center shrink-0">
                
              </div>
              <div>
                <p className="text-sm font-medium">实地拍照</p>
                <p className="text-[11px] text-[#8a8a8a]">拍摄现场照片作为验证凭证</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
              <div className="w-8 h-8 rounded-full bg-[#2ba640]/15 flex items-center justify-center shrink-0">
                
              </div>
              <div>
                <p className="text-sm font-medium">评价留言</p>
                <p className="text-[11px] text-[#8a8a8a]">验证后必须留下评价</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onMobileVerify?.()}
              className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95"
            >
              开始验证
            </button>
            <button onClick={onClose} className="px-5 py-3 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa] hover:bg-[#2a2a2a] transition">
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PC端显示二维码
  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md bg-[#141414] border border-[#333] rounded-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
        {scanned ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-[#2ba640]/15 flex items-center justify-center mx-auto mb-4 animate-pulse">
              
            </div>
            <h3 className="font-bold text-lg mb-2">已扫描</h3>
            <p className="text-sm text-[#8a8a8a]">请在手机上完成验证操作</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-[#3ea6ff] text-sm">
              <div className="w-2 h-2 rounded-full bg-[#3ea6ff] animate-pulse" />
              等待手机端完成验证...
            </div>
          </div>
        ) : (
          <>
            <div className="text-center mb-5">
              <h3 className="font-bold text-lg mb-1">
                扫码验证
              </h3>
              <p className="text-sm text-[#8a8a8a]">使用手机扫描二维码，前往实地验证</p>
            </div>

            {/* 二维码 */}
            <div className="flex justify-center mb-4">
              <div className="relative p-4 bg-white rounded-2xl shadow-lg shadow-[#3ea6ff]/10">
                <canvas ref={canvasRef} className="block" />
                {countdown <= 0 && (
                  <div className="absolute inset-0 bg-white/90 rounded-2xl flex flex-col items-center justify-center">
                    
                    <p className="text-sm text-[#666]">二维码已过期</p>
                    <button
                      onClick={() => setCountdown(300)}
                      className="mt-2 px-4 py-1.5 rounded-lg bg-[#3ea6ff] text-white text-xs font-semibold"
                    >
                      刷新
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 信息 */}
            <div className="text-center mb-4">
              <p className="text-sm font-medium mb-1">验证「{contentTitle}」</p>
              <p className="text-xs text-[#8a8a8a]">
                有效期 <span className={countdown <= 60 ? "text-[#ff4444]" : "text-[#3ea6ff]"}>{formatTime(countdown)}</span>
              </p>
            </div>

            {/* 步骤说明 */}
            <div className="space-y-2 mb-5">
              {[
                { icon: "fa-mobile-alt", color: "#3ea6ff", text: "打开星聚APP扫描二维码" },
                { icon: "fa-map-marker-alt", color: "#f0b90b", text: "前往目标地址1km范围内" },
                { icon: "fa-camera", color: "#2ba640", text: "拍摄现场照片并提交评价" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-[#212121] flex items-center justify-center shrink-0 text-[10px] font-bold text-[#aaa]">{i + 1}</div>
                  <i className={`fas ${step.icon} text-xs`} style={{ color: step.color }} />
                  <span className="text-[#aaa]">{step.text}</span>
                </div>
              ))}
            </div>

            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa] hover:bg-[#2a2a2a] transition">
              关闭
            </button>
          </>
        )}
      </div>
    </div>
  );
}
