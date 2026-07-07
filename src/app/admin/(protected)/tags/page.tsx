import { getAllTags } from "@/lib/data/tags";
import { TagManager } from "@/components/admin/TagManager";

export default async function AdminTagsPage() {
  const tags = await getAllTags();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-purple-700">Tag 管理</h1>
      <TagManager tags={tags} />
    </div>
  );
}
