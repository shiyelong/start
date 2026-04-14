import { Settings } from 'lucide-react';

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
      <div className="flex items-center gap-2 mb-2">
        <Settings size={24} className="text-[#3ea6ff]" />
        <h1 className="text-2xl font-bold text-[#3ea6ff]">管理后台</h1>
      </div>
      <p className="text-gray-400 mt-2">即将上线</p>
    </div>
  );
}
