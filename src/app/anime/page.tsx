'use client';
import Header from '@/components/layout/Header';

export default function AnimePage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
        <h1 className="text-2xl font-bold text-[#3ea6ff]">动漫中心</h1>
        <p className="text-gray-400 mt-2">聚合多个番剧资源站，追番补番一站搞定</p>
      </div>
    </>
  );
}
