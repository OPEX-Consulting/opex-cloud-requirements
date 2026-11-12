import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#07152f] px-6 text-center text-white">
      <Image src="/images/opexwhite.webp" alt="OPEX Cloud" width={160} height={51} priority className="h-9 w-auto object-contain" />
      <h1 className="mt-8 text-2xl font-bold sm:text-3xl">OPEX Cloud requirements portal</h1>
      <p className="mt-3 max-w-md text-sm text-white/75">
        This portal is for OPEX Cloud clients. Please use the private link your OPEX contact sent you.
      </p>
      <a href="https://opexcloud.com.ng" className="mt-8 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold" style={{ color: "#07152f" }}>
        Visit OPEX Cloud
      </a>
    </main>
  );
}
