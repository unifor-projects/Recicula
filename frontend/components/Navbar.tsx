'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavStore } from '@/store/navStore';
import { useChatStore } from '@/store/chatStore';

const HIDDEN_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={`text-sm font-medium transition-colors hover:text-green-600 ${isActive ? 'text-green-600' : 'text-gray-600'}`}
    >
      {label}
    </Link>
  );
}

function MobileNavLink({
  href,
  label,
  pathname,
}: {
  href: string;
  label: string;
  pathname: string;
}) {
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 hover:text-green-600 ${isActive ? 'bg-green-50 text-green-600' : 'text-gray-700'}`}
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const rawPathname = usePathname();
  const pathname = rawPathname ?? '';
  const { user, isAuthenticated, logout } = useAuth();
  const { isMobileMenuOpen, toggleMobileMenu, closeMobileMenu } = useNavStore();
  const totalUnread = useChatStore((s) => s.totalUnread);

  useEffect(() => {
    closeMobileMenu();
  }, [pathname, closeMobileMenu]);

  if (HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  const navLinks = [
    { href: '/anuncios', label: 'Anúncios' },
    ...(isAuthenticated
      ? [
          { href: '/anuncios/novo', label: 'Criar Anúncio' },
          { href: '/anuncios/meus', label: 'Meus Anúncios' },
        ]
      : []),
    ...(isAuthenticated && user?.is_admin
      ? [{ href: '/admin/moderacao', label: 'Moderação' }]
      : []),
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
        <Link
          href="/anuncios"
          onClick={closeMobileMenu}
          className="text-xl font-bold text-green-600 transition-colors hover:text-green-700"
        >
          ReCircula
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <NavLink key={link.href} href={link.href} label={link.label} pathname={pathname} />
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated && user ? (
            <>
              <Link
                href="/chat"
                aria-label="Mensagens"
                className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-green-600"
              >
                <MessageSquare className="h-5 w-5" />
                {totalUnread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white">
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                )}
              </Link>
              <Link
                href={`/perfil/${user.id}`}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 transition-colors hover:text-green-600"
              >
                <span className="hidden lg:block">{user.nome.split(' ')[0]}</span>
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-red-300 hover:text-red-600"
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 transition-colors hover:text-green-600"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
              >
                Cadastrar
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={toggleMobileMenu}
          aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={isMobileMenuOpen}
          className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 md:hidden"
        >
          {isMobileMenuOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="border-t border-gray-100 bg-white px-4 pb-4 md:hidden">
          <div className="mt-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <MobileNavLink
                key={link.href}
                href={link.href}
                label={link.label}
                pathname={pathname}
              />
            ))}
            {isAuthenticated && (
              <MobileNavLink
                href="/chat"
                label={totalUnread > 0 ? `Mensagens (${totalUnread})` : 'Mensagens'}
                pathname={pathname}
              />
            )}

            <div className="my-2 border-t border-gray-100" />

            {isAuthenticated && user ? (
              <>
                <Link
                  href={`/perfil/${user.id}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-green-600"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700">
                    {getInitials(user.nome)}
                  </span>
                  Meu Perfil
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-green-600"
                >
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-green-600 px-3 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-green-700"
                >
                  Cadastrar
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
