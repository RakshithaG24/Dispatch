import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";

export default function NotFound() {
  return (
    <Layout>
      <div className="py-16">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-muted">The address you followed does not exist.</p>
        <Link to="/" className="mt-6 inline-block text-accent underline underline-offset-2">
          Go to the home page
        </Link>
      </div>
    </Layout>
  );
}
