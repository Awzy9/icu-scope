"use strict";
module.exports = function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"Method not allowed" });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  const knowledgeMapUrl = process.env.NEXT_PUBLIC_KNOWLEDGE_MAP_URL || "https://icu-knowledge-map.vercel.app";
  const mvSimulatorUrl = process.env.NEXT_PUBLIC_MV_SIMULATOR_URL || "https://mv-simulation.vercel.app";
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ok:true, configured:!!(supabaseUrl&&supabaseAnonKey), supabaseUrl:supabaseUrl||null, supabaseAnonKey:supabaseAnonKey||null, knowledgeMapUrl, mvSimulatorUrl});
};
