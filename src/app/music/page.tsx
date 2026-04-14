'use client';
import Header from '@/components/layout/Header';

export default function MusicPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
        <h1 className="text-2xl font-bold text-[#3ea6ff]">音乐中心</h1>
        <p className="text-gray-400 mt-2">聚合多个音乐平台，一个搜索框听遍全网</p>
      </div>
    </>
  );
}
