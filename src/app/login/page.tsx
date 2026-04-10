"use client";
import { useState, FormEvent } from "react";
import Header from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side validation (Requirement 2 AC2, AC3)
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
      // On success, redirect to home (Requirement 17 AC1, AC2)
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
      <main className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
        <div className="w-full max-w-sm bg-bg-secondary border border-border rounded-2xl p-8 animate-slide-up">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl mx-auto mb-3 shadow-lg shadow-accent/25 overflow-hidden">
              <img src="/logo.svg" alt="星聚" className="w-full h-full" />
            </div>
            <h1 className="text-xl font-bold">{isRegister ? "注册" : "登录"} 星聚</h1>
            <p className="text-sm text-muted mt-1">视频·游戏·社区·AI 一站式平台</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Error display */}
            {error && (
              <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
                {error}
              </div>
            )}

            {/* Username — only in register mode */}
            {isRegister && (
              <div>
                <label className="text-xs text-muted mb-1 block">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-10 px-4 bg-bg-card border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent"
                  placeholder="2-20 个字符"
                  required
                  disabled={loading}
                />
              </div>
            )}

            {/* Email — both modes */}
            <div>
              <label className="text-xs text-muted mb-1 block">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-4 bg-bg-card border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            {/* Password — both modes */}
            <div>
              <label className="text-xs text-muted mb-1 block">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-4 bg-bg-card border border-border rounded-lg text-sm text-white placeholder-muted outline-none focus:border-accent"
                placeholder={isRegister ? "至少 6 个字符" : "输入密码"}
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-accent text-bg font-semibold text-sm hover:bg-accent-hover transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {isRegister ? "注册" : "登录"}
            </button>

            <p className="text-center text-xs text-muted">
              {isRegister ? "已有账号？" : "没有账号？"}
              <button
                type="button"
                onClick={toggleMode}
                className="text-accent hover:text-accent-hover ml-1"
                disabled={loading}
              >
                {isRegister ? "去登录" : "去注册"}
              </button>
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
