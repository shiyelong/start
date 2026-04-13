"use client";
import { useState, useRef, useCallback } from "react";
import { calcDistance, formatDistance, isWithinRange, type GeoLocation } from "@/lib/content-verify";

/**
 * 地理位置验证 + 拍照组件
 * - 获取用户GPS定位
 * - 检查是否在目标地址1km范围内
 * - 拍照上传（实拍 + 平台摄像头）
 * - 提交评价
 */

interface GeoVerifyProps {
  targetLocation: GeoLocation;
  contentTitle: string;
  onSubmit: (data: {
    location: GeoLocation;
    distance: number;
    photos: string[];
    comment: string;
    rating: number;
    status: "approved" | "rejected";
  }) => void;
  onClose: () => void;
}

type Step = "locate" | "photo" | "comment" | "done";

export default function GeoVerify({ targetLocation, contentTitle, onSubmit, onClose }: GeoVerifyProps) {
  const [step, setStep] = useState<Step>("locate");
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState(5);
  const [verifyResult, setVerifyResult] = useState<"approved" | "rejected">("approved");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 获取GPS定位
  const getLocation = useCallback(() => {
    setLocating(true);
    setLocError(null);

    if (!navigator.geolocation) {
      setLocError("您的浏览器不支持定位功能");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: GeoLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          address: "定位获取中...",
          accuracy: pos.coords.accuracy,
        };
        const dist = calcDistance(loc.lat, loc.lng, targetLocation.lat, targetLocation.lng);
        setUserLocation(loc);
        setDistance(dist);
        setLocating(false);
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocError("定位权限被拒绝，请在设置中允许定位");
            break;
          case err.POSITION_UNAVAILABLE:
            setLocError("无法获取位置信息");
            break;
          case err.TIMEOUT:
            setLocError("定位超时，请重试");
            break;
          default:
            setLocError("定位失败，请重试");
        }
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [targetLocation]);

  // 处理拍照/选择图片
  const handlePhoto = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setPhotos(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, []);

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const withinRange = distance !== null && isWithinRange(
    userLocation?.lat || 0, userLocation?.lng || 0,
    targetLocation.lat, targetLocation.lng
  );

  const handleSubmit = () => {
    if (!userLocation || distance === null) return;
    onSubmit({
      location: userLocation,
      distance,
      photos,
      comment,
      rating,
      status: verifyResult,
    });
    setStep("done");
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#141414] border border-[#333] rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="sticky top-0 z-10 bg-[#141414]/95 backdrop-blur-xl border-b border-[#333]/50 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">
              <i className="fas fa-shield-check mr-2 text-[#3ea6ff]" />实地验证
            </h3>
            <p className="text-[11px] text-[#8a8a8a]">{contentTitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#212121] flex items-center justify-center text-[#8a8a8a] hover:text-white transition">
            <i className="fas fa-times" />
          </button>
        </div>

        {/* 步骤指示器 */}
        <div className="px-5 py-3 border-b border-[#333]/30">
          <div className="flex items-center justify-between">
            {[
              { key: "locate", icon: "fa-map-marker-alt", label: "定位" },
              { key: "photo", icon: "fa-camera", label: "拍照" },
              { key: "comment", icon: "fa-comment", label: "评价" },
            ].map((s, i) => {
              const steps: Step[] = ["locate", "photo", "comment"];
              const currentIdx = steps.indexOf(step === "done" ? "comment" : step);
              const stepIdx = i;
              const isActive = stepIdx === currentIdx;
              const isDone = stepIdx < currentIdx || step === "done";
              return (
                <div key={s.key} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition ${
                    isDone ? "bg-[#2ba640]/15 text-[#2ba640]" :
                    isActive ? "bg-[#3ea6ff]/15 text-[#3ea6ff]" :
                    "bg-[#212121] text-[#666]"
                  }`}>
                    <i className={`fas ${isDone ? "fa-check" : s.icon}`} />
                    <span>{s.label}</span>
                  </div>
                  {i < 2 && <div className={`w-8 h-px mx-1 ${isDone ? "bg-[#2ba640]" : "bg-[#333]"}`} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-4">
          {/* Step 1: 定位 */}
          {step === "locate" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#333]/50">
                <div className="flex items-center gap-2 mb-3">
                  <i className="fas fa-map-pin text-[#ff4444]" />
                  <span className="text-sm font-medium">目标地址</span>
                </div>
                <p className="text-sm text-[#aaa]">{targetLocation.address}</p>
                <p className="text-[11px] text-[#666] mt-1">
                  坐标: {targetLocation.lat.toFixed(6)}, {targetLocation.lng.toFixed(6)}
                </p>
              </div>

              {userLocation && distance !== null && (
                <div className={`p-4 rounded-xl border ${
                  withinRange
                    ? "bg-[#2ba640]/10 border-[#2ba640]/30"
                    : "bg-[#ff4444]/10 border-[#ff4444]/30"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      <i className={`fas ${withinRange ? "fa-check-circle text-[#2ba640]" : "fa-exclamation-circle text-[#ff4444]"} mr-1.5`} />
                      {withinRange ? "在验证范围内" : "不在验证范围内"}
                    </span>
                    <span className={`text-sm font-bold ${withinRange ? "text-[#2ba640]" : "text-[#ff4444]"}`}>
                      {formatDistance(distance)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8a8a8a]">
                    {withinRange
                      ? "您已在目标地址1km范围内，可以继续验证"
                      : `距离目标地址 ${formatDistance(distance)}，需要在1km范围内才能验证`}
                  </p>
                  {userLocation.accuracy && (
                    <p className="text-[10px] text-[#666] mt-1">定位精度: ±{Math.round(userLocation.accuracy)}m</p>
                  )}
                </div>
              )}

              {locError && (
                <div className="p-3 rounded-xl bg-[#ff4444]/10 border border-[#ff4444]/30 text-sm text-[#ff4444]">
                  <i className="fas fa-exclamation-triangle mr-1.5" />{locError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={getLocation}
                  disabled={locating}
                  className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95 disabled:opacity-50"
                >
                  {locating ? (
                    <><i className="fas fa-spinner fa-spin mr-1.5" />定位中...</>
                  ) : userLocation ? (
                    <><i className="fas fa-redo mr-1.5" />重新定位</>
                  ) : (
                    <><i className="fas fa-crosshairs mr-1.5" />获取定位</>
                  )}
                </button>
                {withinRange && (
                  <button
                    onClick={() => setStep("photo")}
                    className="flex-1 py-3 rounded-xl bg-[#2ba640] text-white font-bold text-sm hover:bg-[#2ba640]/80 transition active:scale-95"
                  >
                    下一步 <i className="fas fa-arrow-right ml-1" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 2: 拍照 */}
          {step === "photo" && (
            <div className="space-y-4">
              <p className="text-sm text-[#aaa]">
                请拍摄现场照片作为验证凭证，至少需要1张照片
              </p>

              {/* 照片网格 */}
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-[#1a1a1a]">
                    <img src={photo} alt={`照片${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-xs"
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                ))}

                {/* 拍照按钮 */}
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-[#333] flex flex-col items-center justify-center gap-1 text-[#666] hover:border-[#3ea6ff] hover:text-[#3ea6ff] transition"
                >
                  <i className="fas fa-camera text-lg" />
                  <span className="text-[10px]">拍照</span>
                </button>

                {/* 相册选择 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-[#333] flex flex-col items-center justify-center gap-1 text-[#666] hover:border-[#f0b90b] hover:text-[#f0b90b] transition"
                >
                  <i className="fas fa-images text-lg" />
                  <span className="text-[10px]">相册</span>
                </button>
              </div>

              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />

              {/* 平台摄像头拍摄提示 */}
              <div className="p-3 rounded-xl bg-[#f0b90b]/10 border border-[#f0b90b]/30">
                <div className="flex items-center gap-2 text-sm text-[#f0b90b] mb-1">
                  <i className="fas fa-video" />
                  <span className="font-medium">平台摄像头验证</span>
                </div>
                <p className="text-[11px] text-[#8a8a8a]">
                  系统将同时通过平台摄像头进行拍摄验证，确保真实性
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep("locate")} className="px-5 py-3 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa] hover:bg-[#2a2a2a] transition">
                  <i className="fas fa-arrow-left mr-1" />返回
                </button>
                <button
                  onClick={() => setStep("comment")}
                  disabled={photos.length === 0}
                  className="flex-1 py-3 rounded-xl bg-[#2ba640] text-white font-bold text-sm hover:bg-[#2ba640]/80 transition active:scale-95 disabled:opacity-50"
                >
                  下一步 <i className="fas fa-arrow-right ml-1" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 评价 */}
          {step === "comment" && (
            <div className="space-y-4">
              {/* 验证结果 */}
              <div>
                <label className="text-sm font-medium mb-2 block">验证结果</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setVerifyResult("approved")}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                      verifyResult === "approved"
                        ? "bg-[#2ba640] text-white"
                        : "bg-[#212121] border border-[#333] text-[#aaa]"
                    }`}
                  >
                    <i className="fas fa-check-circle mr-1.5" />信息属实
                  </button>
                  <button
                    onClick={() => setVerifyResult("rejected")}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                      verifyResult === "rejected"
                        ? "bg-[#ff4444] text-white"
                        : "bg-[#212121] border border-[#333] text-[#aaa]"
                    }`}
                  >
                    <i className="fas fa-times-circle mr-1.5" />信息不实
                  </button>
                </div>
              </div>

              {/* 评分 */}
              <div>
                <label className="text-sm font-medium mb-2 block">评分</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`text-xl transition ${star <= rating ? "text-[#f0b90b]" : "text-[#333]"}`}
                    >
                      <i className="fas fa-star" />
                    </button>
                  ))}
                  <span className="text-sm text-[#8a8a8a] ml-2 self-center">{rating}分</span>
                </div>
              </div>

              {/* 评论 */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  验证评价 <span className="text-[#ff4444]">*</span>
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="请详细描述您的验证情况..."
                  rows={4}
                  className="w-full p-3 bg-[#1a1a1a] border border-[#333] rounded-xl text-sm text-white placeholder-[#666] outline-none focus:border-[#3ea6ff] transition resize-none"
                />
                <p className="text-[10px] text-[#666] mt-1">{comment.length}/500</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep("photo")} className="px-5 py-3 rounded-xl bg-[#212121] border border-[#333] text-sm text-[#aaa] hover:bg-[#2a2a2a] transition">
                  <i className="fas fa-arrow-left mr-1" />返回
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!comment.trim()}
                  className="flex-1 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition active:scale-95 disabled:opacity-50"
                >
                  <i className="fas fa-paper-plane mr-1.5" />提交验证
                </button>
              </div>
            </div>
          )}

          {/* 完成 */}
          {step === "done" && (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-[#2ba640]/15 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-check-circle text-[#2ba640] text-4xl animate-bounce" />
              </div>
              <h3 className="font-bold text-lg mb-2">验证提交成功</h3>
              <p className="text-sm text-[#8a8a8a] mb-6">感谢您的验证，您的评价将帮助其他用户</p>
              <button
                onClick={onClose}
                className="px-8 py-3 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] transition"
              >
                完成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
