import clsx from 'clsx';

type CatalogoAmbiente = 'HOMOLOGACAO' | 'PRODUCAO';

const LABELS: Record<CatalogoAmbiente, string> = {
  HOMOLOGACAO: 'Homologação',
  PRODUCAO: 'Produção'
};

const STYLES: Record<CatalogoAmbiente, string> = {
  HOMOLOGACAO: 'bg-amber-400/20 text-amber-200 border border-amber-400',
  PRODUCAO: 'bg-emerald-400/20 text-emerald-200 border border-emerald-500'
};

interface EnvironmentBadgeProps {
  ambiente: CatalogoAmbiente;
  className?: string;
  size?: 'sm' | 'md';
}

export function EnvironmentBadge({ ambiente, className, size = 'md' }: EnvironmentBadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-semibold uppercase tracking-wide',
        sizeClasses,
        STYLES[ambiente],
        className
      )}
    >
      {LABELS[ambiente]}
    </span>
  );
}
