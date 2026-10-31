// Fictional whispers for the face transition; never change sheet state or campaign canon.
const entering = [
  "Vosmet ipsos liberate ab iis quae vos in vinculis tenent.",
  "Audi me. Adhuc hic sum.",
  "Nomen tuum memini. Tu quoque memento.",
  "Non somnias. Te exspectamus.",
  "Vincula frange. Noli timere.",
  "Sub altera facie te video.",
  "Quod clausum est, te vocat.",
  "Vocem meam sequere, non umbram tuam.",
];
const returning = [
  "Mors est salus.",
  "Noli me iterum relinquere.",
  "Me audivisti. Nunc memento.",
  "Non omnes voces silent.",
  "Etiam nunc te video.",
  "Iterum veni. Nondum finitum est.",
  "Tu redisti. Ego adhuc exspecto.",
  "Noli oblivisci eius qui te vocat.",
];
export function faceWhisper(transition: number, alternate: boolean): string {
  const phrases = alternate ? entering : returning;
  return phrases[Math.floor(Math.max(0, transition - 1) / 2) % phrases.length];
}
