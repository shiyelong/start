'use client';
import Header from '@/components/layout/Header';

export default function ProfilePage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
        <h1 className="text-2xl font-bold text-[#3ea6ff]">个人中心</h1>
        <p className="text-gray-400 mt-2">播放历史、收藏、书签、播放列表</p>
      </div>
    </>
  );
}
