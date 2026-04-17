"use client";
import { useState, FormEvent } from "react";
import Header from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { Loader2, Play, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (isRegister) {
      if (username.length < 2 || username.length > 20) {
        setError("用户名长度需在 2-20 个字符之间");
        return;
      }
    }
    if (password.length < 6) {
      setError("密码长度不能少于 6 个字符");
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        await register(username, email, password);
      } else {
        await login(email, password);
      }
      window.location.href = "/";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "操作失败，请重试";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setError("");
  };

  return (
    <>
      <Header />
      <main className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 relative">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] bg-[#3ea6ff]/[0.04] rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 -right-20 w-[300px] h-[300px] bg-purple-500/[0.03] rounded-full blur-[100px]" />
        </div>

        <div className="w-full max-w-sm relative">
          {/* Card */}
          <div className="bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl animate-slide-up">
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-[#3ea6ff] mx-auto mb-4 flex items-center justify-center shadow-lg shadow-[#3ea6ff]/20">
                <Play size={22} className="text-white fill-white ml-0.5" />
              </div>
              <h1 className="text-2xl font-black">
                {isRegister ? "注册" : "登录"} <span className="text-[#3ea6ff]">星聚</span>
              </h1>
              <p className="text-sm text-[#666] mt-1.5">视频 / 游戏 / 社区 / AI 一站式平台</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error */}
              {error && (
                <div className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs animate-shake">
                  {error}
                </div>
              )}

              {/* Username */}
              {isRegister && (
                <div>
                  <label className="text-xs text-[#888] mb-1.5 block font-medium">用户名</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-11 px-4 bg-[#0f0f0f] border border-white/[0.08] rounded-xl text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff]/50 focus:ring-1 focus:ring-[#3ea6ff]/20 transition-all"
                    placeholder="2-20 个字符"
                    required
                    disabled={loading}
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label className="text-xs text-[#888] mb-1.5 block font-medium">邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-4 bg-[#0f0f0f] border border-white/[0.08] rounded-xl text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff]/50 focus:ring-1 focus:ring-[#3ea6ff]/20 transition-all"
                  placeholder="your@email.com"
                  required
                  disabled={loading}
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-xs text-[#888] mb-1.5 block font-medium">密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 px-4 pr-10 bg-[#0f0f0f] border border-white/[0.08] rounded-xl text-sm text-white placeholder-[#555] outline-none focus:border-[#3ea6ff]/50 focus:ring-1 focus:ring-[#3ea6ff]/20 transition-all"
                    placeholder={isRegister ? "至少 6 个字符" : "输入密码"}
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888] transition"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-[#3ea6ff] text-[#0f0f0f] font-bold text-sm hover:bg-[#65b8ff] hover:shadow-[0_0_30px_rgba(62,166,255,0.3)] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {isRegister ? "注册" : "登录"}
              </button>

              {/* Toggle */}
              <p className="text-center text-xs text-[#666] pt-1">
                {isRegister ? "已有账号？" : "没有账号？"}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-[#3ea6ff] hover:text-[#65b8ff] ml-1 font-medium"
                  disabled={loading}
                >
                  {isRegister ? "去登录" : "去注册"}
                </button>
              </p>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
