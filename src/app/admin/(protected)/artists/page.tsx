import { listArtistAccounts } from "@/lib/data/artist-accounts";
import { ArtistAccountList } from "@/components/admin/ArtistAccountList";

export default async function AdminArtistsPage() {
  const artists = await listArtistAccounts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">繪師管理</h1>
        <p className="mt-1 text-sm text-zinc-500">
          建立繪師帳號、設定初始密碼、重設密碼、啟用／停用帳號。繪師登入後只能管理自己的商店。
        </p>
      </div>
      <ArtistAccountList artists={artists} />
    </div>
  );
}
