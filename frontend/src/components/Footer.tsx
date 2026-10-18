import { Link } from "react-router-dom";
import { site } from "../config/site";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          &copy; {new Date().getFullYear()} {site.company}
        </p>
        <nav aria-label="Legal" className="flex gap-5">
          <Link to="/privacy" className="hover:text-ink hover:underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-ink hover:underline">
            Terms and Conditions
          </Link>
          <a href={`mailto:${site.contactEmail}`} className="hover:text-ink hover:underline">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
