export const itemImageLimit = 240_000;
export function validItemImage(value: string) {
  if (value.length > itemImageLimit) return false;
  return (
    /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    /^\/art\/(?:rituals|items|custom)\/[a-z0-9_-]+\.webp$/.test(value) ||
    /^https:\/\/raw\.githubusercontent\.com\/lyanlocker\/fenix-rpg\/[a-f0-9]{40}\/public\/art\/items\/[a-f0-9]{64}\.webp$/.test(
      value,
    )
  );
}
