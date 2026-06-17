export default function Footer() {
  return (
    <footer
      className="py-12 px-6 text-center"
      style={{ background: "#0D1117", color: "#4B5563" }}
    >
      <p
        className="font-serif text-xl font-semibold mb-1"
        style={{ color: "#C9A030" }}
      >
        IdeaToPlan
      </p>
      <p className="text-sm mb-4" style={{ color: "#6B7280" }}>
        It&apos;s never been easier to start your own business.
      </p>
      <p className="text-xs" style={{ color: "#374151" }}>
        © {new Date().getFullYear()} IdeaToPlan. All rights reserved.
      </p>
    </footer>
  );
}
