import type { ButtonHTMLAttributes } from 'react';
type Props=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'default'|'outline'};
export function Button({variant='default',className='',...props}:Props){return <button className={`ui-button ui-button-${variant} ${className}`} {...props}/>;}
