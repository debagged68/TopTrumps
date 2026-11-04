import type { Metadata } from 'next';
import './globals.css';
import './two-card.css';
export const metadata:Metadata={title:'Top Trumps',icons:{icon:'/icon.svg',apple:'/apple-icon.png'},description:'Two cards. Six sins. One winning choice. An illustrated political satire card game.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
