"use client";

/**
 * App footer with copyright and links
 */
export function Footer() {
  return (
    <footer className="border-t border-zinc-900 py-8 mt-auto">
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-sm text-zinc-500">
        <div>&copy; 2024 Dustless</div>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-white transition-colors">Docs</a>
          <a href="#" className="hover:text-white transition-colors">GitHub</a>
          <a href="#" className="hover:text-white transition-colors">Twitter</a>
        </div>
      </div>
    </footer>
  );
}
