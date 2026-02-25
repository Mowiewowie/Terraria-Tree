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
        // FIX: Moved from PostSetupContent to PostAddRecipes to guarantee data exists
        public override void PostAddRecipes()
        {
            if (Main.netMode == NetmodeID.Server || Console.IsInputRedirected)
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
                    Console.WriteLine(e.StackTrace); // Provide exact line numbers if it fails again
                }

                Environment.Exit(0); 
            }
        }

        private Dictionary<int, List<object>> BuildDropDatabase()
        {
            var dropMap = new Dictionary<int, List<object>>();
            var feed = new DropRateInfoChainFeed(1f);

            var allDropsForSlime = Main.ItemDropsDB.GetRulesForNPCID(1, includeGlobalDrops: true);
            var specificDropsForSlime = Main.ItemDropsDB.GetRulesForNPCID(1, includeGlobalDrops: false);
            
            // FIX: Ensure lists aren't null before calling .Except()
            var globalRules = (allDropsForSlime ?? new List<IItemDropRule>())
                .Except(specificDropsForSlime ?? new List<IItemDropRule>())
                .ToList();

            var globalRates = new List<DropRateInfo>();
            foreach (var rule in globalRules) rule.ReportDroprates(globalRates, feed);

            foreach (var dropInfo in globalRates)
            {
                if (!dropMap.ContainsKey(dropInfo.itemId)) dropMap[dropInfo.itemId] = new List<object>();
                dropMap[dropInfo.itemId].Add(new {
                    SourceNPC_ID = -1,
                    SourceNPC_Name = "Any Enemy",
                    DropChance = dropInfo.dropRate,
                    Conditions = dropInfo.conditions?.Select(c => c?.GetConditionDescription() ?? "").ToList()
                });
            }

            for (int npcId = -65; npcId < NPCLoader.NPCCount; npcId++)
            {
                var rules = Main.ItemDropsDB.GetRulesForNPCID(npcId, includeGlobalDrops: false);
                if (rules == null) continue;

                var dropRates = new List<DropRateInfo>();
                foreach (var rule in rules) rule.ReportDroprates(dropRates, feed);

                foreach (var dropInfo in dropRates)
                {
                    if (!dropMap.ContainsKey(dropInfo.itemId)) dropMap[dropInfo.itemId] = new List<object>();
                    dropMap[dropInfo.itemId].Add(new {
                        SourceNPC_ID = npcId,
                        SourceNPC_Name = Lang.GetNPCNameValue(npcId) ?? "Unknown Entity",
                        DropChance = dropInfo.dropRate,
                        Conditions = dropInfo.conditions?.Select(c => c?.GetConditionDescription() ?? "").ToList()
                    });
                }
            }
            return dropMap;
        }

        private void ExportData(string path, Dictionary<int, List<object>> globalDropMap)
        {
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
                        InternalName = ItemID.Search.GetName(i) ?? item.Name,
                        DisplayName = Lang.GetItemNameValue(i) ?? item.Name,
                        ModSource = item.ModItem?.Mod?.Name ?? "Vanilla",
                        Stats = new {
                            Damage = item.damage,
                            // FIX: Gracefully handle missing DamageClasses
                            DamageClass = item.DamageType?.DisplayName ?? "Default",
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
            
            // FIX: Restrict to valid recipes and ensure objects are not null
            var validRecipes = Main.recipe.Take(Recipe.numRecipes)
                .Where(r => r != null && r.createItem != null && r.createItem.type == itemId);

            foreach (Recipe recipe in validRecipes)
            {
                recipeList.Add(new {
                    // FIX: Safe Tile name resolution bypassing MapHelper
                    Stations = recipe.requiredTile?.Select(t => TileLoader.GetTile(t)?.Name ?? TileID.Search.GetName(t) ?? t.ToString()).ToList() ?? new List<string>(),
                    // FIX: Ignore ID 0 (Air)
                    Ingredients = recipe.requiredItem?.Where(req => req != null && req.type > 0).Select(req => new { 
                        ID = req.type, 
                        Name = Lang.GetItemNameValue(req.type), 
                        Amount = req.stack 
                    }).ToList() ?? new List<object>()
                });
            }
            return recipeList;
        }
    }
}