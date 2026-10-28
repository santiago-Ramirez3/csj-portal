import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <Link href="/">Back to dashboard</Link>
    </div>
  );
}
