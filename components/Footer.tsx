import React, { useEffect, useRef } from "react";
import "./Footer.css";

const Footer = () => {
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastScrollTop = 0;

    const getScrollTop = (target: EventTarget | null): number => {
      if (target instanceof HTMLElement) return target.scrollTop;
      return window.scrollY;
    };

    const handleScroll = (e: Event) => {
      const currentScrollTop = getScrollTop(e.target);
      if (footerRef.current) {
        if (currentScrollTop > lastScrollTop) {
          // Scrolling down
          footerRef.current.classList.remove("footer-hidden");
        } else if (currentScrollTop < lastScrollTop) {
          // Scrolling up
          footerRef.current.classList.add("footer-hidden");
        }
      }
      lastScrollTop = currentScrollTop;
    };
    // Capture phase: catches scroll events from nested scrollable
    // containers too (e.g. the catalog grid), not just window/document.
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, []);

  return (
    <div ref={footerRef} className="site-footer minimal-footer">
      <div className="footer-row">
        <span>
          <a href="https://wa.me/5511942058445" target="_blank" rel="noopener noreferrer">WhatsApp: 11 94205-8445</a>
        </span>
        <span>
          <a href="mailto:orcamento@girakids.com">orcamento@girakids.com</a>
        </span>
        <span>Av. Cachoeira Paulista, 17</span>
        <span>Prime Plush x Gira Kids 2026</span>
        <span>Todos os direitos reservados</span>
      </div>
    </div>
  );
};

export default Footer;
