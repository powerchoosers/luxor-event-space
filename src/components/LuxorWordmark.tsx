import Image from 'next/image'

type LuxorWordmarkProps = {
  className?: string
  markClassName?: string
  mark?: boolean
  compact?: boolean
  align?: 'left' | 'center'
  horizontal?: boolean
  subline?: boolean
}

type LuxorAxisLockupProps = {
  className?: string
  dividerClassName?: string
  showDivider?: boolean
}

export function LuxorWordmark({
  className = '',
  markClassName = '',
  mark = true,
  compact = false,
  align = 'left',
  horizontal = false,
  subline = true,
}: LuxorWordmarkProps) {
  return (
    <div className={`luxor-live-lockup max-w-full ${horizontal ? `!flex-row items-center !gap-3.5 text-left ${align === 'center' ? 'justify-center' : ''}` : align === 'center' ? 'items-center text-center' : 'items-start text-left'} ${className}`}>
      {mark ? (
        <Image
          src="/luxor-palm-mark.png"
          alt=""
          width={255}
          height={190}
          className={(compact ? horizontal ? 'h-11 w-11 self-center shrink-0 rounded-full border border-[#caa24c]/70 p-0.5 object-contain object-[center_42%]' : 'h-9 w-auto object-contain' : 'h-14 w-auto object-contain sm:h-16') + ' ' + markClassName}
          priority={compact}
        />
      ) : null}
      <div className={`leading-none ${compact && horizontal ? 'translate-y-[0.05rem]' : ''}`}>
        <p className={`luxor-wordmark ${compact ? 'text-[2.35rem] sm:text-[2.6rem]' : 'text-[3.35rem] sm:text-[5.8rem] lg:text-[7rem]'}`}>
          LUXOR
        </p>
        {subline ? (
          <p className={`luxor-subline ${compact ? 'mt-1 text-[0.44rem] sm:text-[0.5rem]' : 'mt-3 text-[0.58rem] sm:text-[0.86rem] lg:text-[1rem]'}`}>
            AT LAS PALMAS EVENTS
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function LuxorAxisLockup({
  className = '',
  dividerClassName = 'text-[#caa24c]',
  showDivider = true,
}: LuxorAxisLockupProps) {
  return (
    <div className={`luxor-axis-lockup ${className}`}>
      <Image
        src="/luxor-palm-mark.png"
        alt=""
        width={255}
        height={190}
        className="h-14 w-auto object-contain sm:h-16"
      />
      <div className="leading-none">
        <p className="luxor-axis-word" aria-label="LUXOR">
          {['L', 'U', 'X', 'O', 'R'].map((letter) => (
            <span key={letter} aria-hidden="true">
              {letter}
            </span>
          ))}
        </p>
        <p className="luxor-axis-subline">AT LAS PALMAS EVENTS</p>
      </div>
      {showDivider ? (
        <div className={`luxor-deco-divider mt-5 w-full ${dividerClassName}`}>
          <span className="luxor-diamond" />
        </div>
      ) : null}
    </div>
  )
}












