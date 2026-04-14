'use client';
import Header from '@/components/layout/Header';

export default function SettingsPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
        <h1 className="text-2xl font-bold text-[#3ea6ff]">设置</h1>
        <p className="text-gray-400 mt-2">账户管理、分级模式、通知偏好</p>
      </div>
    </>
  );
}
