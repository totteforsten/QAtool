import ScanRunner from "./components/ScanRunner";

export default function Page() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Quality-assurance audits for WordPress sites
        </h1>
        <p className="mt-2 text-white/60 max-w-2xl">
          Scan any public URL for SEO and responsive-design issues. Pages hosted on WordPress (Elementor or
          Breakdance) can be patched inline with the companion plugin.
        </p>
      </section>
      <ScanRunner />
    </div>
  );
}
