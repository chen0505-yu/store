import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { logoutMember } from "@/lib/actions/auth";

async function handleLogout() {
  "use server";
  await logoutMember();
}

export async function Header() {
  const member = await getCurrentMember();

  return (
    <header className="sticky top-0 z-20 border-b border-pink-100 bg-white/80 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold text-purple-700"
        >
          <span>🦝</span>
          <span>LITAN</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-purple-600">
          <Link href="/preorder" className="hover:text-purple-800">
            預購專區
          </Link>
          <Link href="/instock" className="hover:text-purple-800">
            現貨專區
          </Link>
          <Link href="/member" className="hover:text-purple-800">
            會員中心
          </Link>
          {member ? (
            <>
              <span className="text-xs text-zinc-400">{member.fbName}</span>
              <form action={handleLogout}>
                <button type="submit" className="hover:text-purple-800">
                  登出
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-purple-800">
                登入
              </Link>
              <Link href="/register" className="hover:text-purple-800">
                註冊
              </Link>
            </>
          )}
          <Link href="/admin" className="text-xs text-zinc-400 hover:text-purple-800">
            後台
          </Link>
        </nav>
      </div>
    </header>
  );
}
