using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Terraria;
using Terraria.ID;
using Terraria.ModLoader;
using Terraria.GameContent.ItemDropRules;

namespace DataExporterMod
{
    public class DataExporterSystem : ModSystem
    {
        public override void PostSetupContent()
        {
            // SECURITY: Only run if the environment is a headless server (GitHub Action)
            if (Main.netMode == ID.NetmodeID.Server || Console.IsInputRedirected)
            {
                Console.WriteLine("[CI/CD] Automated Export Started...");
                string exportPath = Path.Combine(Main.SavePath, "Terraria_Comprehensive_Export.json");
                
                try 
                {
                    Dictionary<int, List<object>> globalDropMap = BuildDropDatabase();
                    ExportData(exportPath, globalDropMap);
                    Console.WriteLine("[CI/CD] Export Successful. Shutting down server gracefully.");
                }
                catch (Exception e) 
                {
                    Console.WriteLine($"[CI/CD] Export Failed: {e.Message}");
                }

                // Force the server to close so the GitHub Action step finishes
                Environment.Exit(0); 
            }
        }

        private Dictionary<int, List<object>> BuildDropDatabase()
        {
            var dropMap = new Dictionary<int, List<object>>();
            var feed = new DropRateInfoChainFeed(1f);

            // 1. Evaluate Global Drops ("Any Enemy") to save JSON space
            var globalRules = Main.ItemDropsDB.GetGlobalRules();
            var globalRates = new List<DropRateInfo>();
            foreach (var rule in globalRules) rule.ReportDroprates(globalRates, feed);

            foreach (var dropInfo in globalRates)
            {
                if (!dropMap.ContainsKey(dropInfo.itemId)) dropMap[dropInfo.itemId] = new List<object>();
                dropMap[dropInfo.itemId].Add(new {
                    SourceNPC_ID = -1,
                    SourceNPC_Name = "Any Enemy",
                    DropChance = dropInfo.dropRate,
                    Conditions = dropInfo.conditions?.Select(c => c.GetConditionDescription()).ToList()
                });
            }

            // 2. Evaluate Specific Enemy Drops
            for (int npcId = -65; npcId < NPCLoader.NPCCount; npcId++)
            {
                var rules = Main.ItemDropsDB.GetRulesForNPCID(npcId, includeGlobalDrops: false);
                var dropRates = new List<DropRateInfo>();
                foreach (var rule in rules) rule.ReportDroprates(dropRates, feed);

                foreach (var dropInfo in dropRates)
                {
                    if (!dropMap.ContainsKey(dropInfo.itemId)) dropMap[dropInfo.itemId] = new List<object>();
                    dropMap[dropInfo.itemId].Add(new {
                        SourceNPC_ID = npcId,
                        SourceNPC_Name = Lang.GetNPCNameValue(npcId),
                        DropChance = dropInfo.dropRate,
                        Conditions = dropInfo.conditions?.Select(c => c.GetConditionDescription()).ToList()
                    });
                }
            }
            return dropMap;
        }

        private void ExportData(string path, Dictionary<int, List<object>> globalDropMap)
        {
            // SECURITY: Stream writing prevents OOM (Out of Memory) DoS attacks on the runner
            using (StreamWriter sw = new StreamWriter(path))
            using (JsonTextWriter writer = new JsonTextWriter(sw))
            {
                writer.Formatting = Formatting.Indented;
                writer.WriteStartArray();

                for (int i = 1; i < ItemLoader.ItemCount; i++)
                {
                    Item item = ContentSamples.ItemsByType[i];
                    if (item == null || string.IsNullOrEmpty(item.Name)) continue;

                    globalDropMap.TryGetValue(i, out var drops);

                    var itemData = new {
                        ID = i,
                        InternalName = ItemID.Search.GetName(i),
                        DisplayName = Lang.GetItemNameValue(i),
                        ModSource = item.ModItem?.Mod.Name ?? "Vanilla",
                        Stats = new {
                            Damage = item.damage,
                            DamageClass = item.DamageType.DisplayName,
                            Knockback = item.knockBack,
                            CritChance = item.crit,
                            UseTime = item.useTime,
                            Defense = item.defense,
                            Value = item.value,
                            Rarity = item.rare
                        },
                        Recipes = GetRecipesForItem(i),
                        ObtainedFromDrops = drops ?? new List<object>()
                    };

                    JsonSerializer.CreateDefault().Serialize(writer, itemData);
                }
                writer.WriteEndArray();
            }
        }

        private List<object> GetRecipesForItem(int itemId)
        {
            var recipeList = new List<object>();
            foreach (Recipe recipe in Main.recipe.Where(r => r.createItem.type == itemId))
            {
                recipeList.Add(new {
                    Stations = recipe.requiredTile.Select(t => Lang.GetMapObjectName(MapHelper.TileToLookup(t, 0))).ToList(),
                    Ingredients = recipe.requiredItem.Select(req => new { ID = req.type, Name = Lang.GetItemNameValue(req.type), Amount = req.stack }).ToList()
                });
            }
            return recipeList;
        }
    }
}