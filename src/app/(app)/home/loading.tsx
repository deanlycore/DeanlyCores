export default function HomeLoading() {
  return (
    <div className="grid gap-5">
      <div className="deanly-skeleton h-10 w-72 rounded-xl" />
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="deanly-skeleton h-40 rounded-[16px] lg:rounded-[20px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="deanly-skeleton h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
