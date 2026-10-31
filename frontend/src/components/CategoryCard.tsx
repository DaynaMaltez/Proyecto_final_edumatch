import Icon, { type IconName } from './Icon';

type CategoryCardProps = { name: string; icon: IconName; count: string; onSelect: (name: string) => void };

export default function CategoryCard({ name, icon, count, onSelect }: CategoryCardProps) {
  return <button className="category-card" type="button" onClick={() => onSelect(name)} aria-label={`Buscar ${name}`}>
    <span className={`category-card__icon category-card__icon--${icon}`}><Icon name={icon} /></span>
    <span className="category-card__name">{name}</span>
    <span className="category-card__description">{count}</span>
    <span className="category-card__arrow"><Icon name="arrow" /></span>
  </button>;
}
