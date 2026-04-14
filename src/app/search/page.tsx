'use client';
import Header from '@/components/layout/Header';

export default function SearchPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
        <h1 className="text-2xl font-bold text-[#3ea6ff]">全局搜索</h1>
        <p className="text-gray-400 mt-2">一个搜索框，搜遍视频、音乐、漫画、小说、游戏、直播、播客</p>
      </div>
    </>
  );
}
