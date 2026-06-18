import { motion } from "framer-motion";

export default function Protocol() {
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  const cards = [
    {
      label: "POLICY ENGINE",
      title: "Define the rules.",
      description: "Create programmable controls for spending, assets, counterparties, and execution paths.",
    },
    {
      label: "EXECUTION ROUTER",
      title: "Execute safely.",
      description: "Every action passes through policy validation before reaching capital.",
    },
    {
      label: "SMART ACCOUNTS",
      title: "Own the account.",
      description: "Session keys, permissions, batching, and agent-native wallet infrastructure.",
    },
  ];

  return (
    <section className="relative bg-white text-zinc-900 pt-40 lg:pt-56 pb-28 lg:pb-40 px-8 md:px-16 lg:px-24 border-t border-zinc-100 overflow-hidden min-h-[80vh] lg:min-h-[85vh] flex flex-col justify-center">
      <div className="max-w-[1600px] w-full mx-auto">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 md:mb-24 max-w-4xl"
        >
          <span className="text-xs lg:text-sm font-mono tracking-[0.35em] text-zinc-400 uppercase block mb-4">
            THE PROTOCOL
          </span>
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-zinc-900 leading-[1.15]">
            Agent permissions,
            <br />
            defined and enforceable.
          </h2>
        </motion.div>

        {/* Cards Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12"
        >
          {cards.map((card, idx) => (
            <motion.div
              key={idx}
              variants={itemVariants}
              whileHover={{ y: -6 }}
              className="group relative bg-white border border-zinc-200 hover:border-zinc-400 p-10 md:p-12 flex flex-col justify-between aspect-auto md:aspect-square min-h-[320px] transition-colors duration-300 hover:bg-zinc-50 cursor-pointer"
            >
              <div className="space-y-6">
                <span className="text-xs font-mono tracking-[0.2em] text-zinc-400 uppercase block">
                  {card.label}
                </span>
                <h3 className="text-2xl md:text-3xl font-bold text-zinc-900">
                  {card.title}
                </h3>
                <p className="text-base text-zinc-500 font-light leading-relaxed">
                  {card.description}
                </p>
              </div>

              {/* Animated bottom expansion line */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-100 overflow-hidden">
                <div className="h-full w-0 bg-black group-hover:w-full transition-all duration-500 ease-out" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
