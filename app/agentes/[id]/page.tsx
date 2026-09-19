import CharacterSheet from "@/components/character-sheet";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CharacterSheet id={id} />;
}
