import { getAllAnnouncements } from "@/lib/data/announcements";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";
import { AnnouncementRow } from "@/components/admin/AnnouncementRow";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminAnnouncementsPage() {
  const announcements = await getAllAnnouncements();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-purple-700">公告管理</h1>
      <AnnouncementForm />
      {announcements.length === 0 ? (
        <EmptyState text="尚未發布任何公告" />
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((a) => (
            <AnnouncementRow key={a.id} announcement={a} />
          ))}
        </div>
      )}
    </div>
  );
}
