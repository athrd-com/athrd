export default function Loading() {
  return (
    <div className="min-h-screen w-full text-white font-sans">
      <main className="relative z-10 container mx-auto w-full px-4 py-4 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          {/* Header skeleton */}
          <div className="mb-8">
            <div className="h-8 bg-gray-800 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-800 rounded w-1/2"></div>
          </div>

          {/* Content skeleton */}
          <div className="space-y-4">
            <div className="h-32 bg-gray-800 rounded"></div>
            <div className="h-24 bg-gray-800 rounded"></div>
            <div className="h-40 bg-gray-800 rounded"></div>
            <div className="h-24 bg-gray-800 rounded"></div>
          </div>
        </div>
      </main>
    </div>
  );
}
