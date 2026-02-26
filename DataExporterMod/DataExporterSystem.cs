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
        public override void PostAddRecipes()
        {
            if (Main.netMode == NetmodeID.Server || Console.IsInputRedirected)
            {
                Console.WriteLine("[CI/CD] Automated Export Started...");
                try 
                {
                    Dictionary<int, List<object>> globalDropMap = BuildDropDatabase();
                    ExportData(globalDropMap);
                    Console.WriteLine("[CI/CD] Export Successful. Shutting down server gracefully.");
                }
                catch (Exception e) 
                {
                    Console.WriteLine($"[CI/CD] Export Failed: {e.Message}");
                    Console.WriteLine(e.StackTrace); 
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

        private void ExportData(Dictionary<int, List<object>> globalDropMap)
        {
            var allExportedItems = new List<object>();

            for (int i = 1; i < ItemLoader.ItemCount; i++)
            {
                Item item = ContentSamples.ItemsByType[i];
                if (item == null || string.IsNullOrEmpty(item.Name)) continue;

                globalDropMap.TryGetValue(i, out var drops);
                string modSourceName = item.ModItem?.Mod?.Name ?? "Vanilla";

                string deterministicID = modSourceName == "Vanilla" 
                    ? i.ToString() 
                    : $"{modSourceName}_{item.ModItem?.Name ?? item.Name}".Replace(" ", "");

                string displayName = Lang.GetItemNameValue(i) ?? item.Name;

                var itemData = new {
                    ID = deterministicID,
                    InternalName = item.ModItem?.Name ?? item.Name,
                    DisplayName = displayName,
                    ModSource = modSourceName,
                    Category = DetermineCategory(item),
                    WikiUrl = GenerateWikiUrl(modSourceName, displayName),
                    Stats = new {
                        Damage = item.damage,
                        DamageClass = item.DamageType?.DisplayName?.Value ?? item.DamageType?.Name ?? "Default",
                        Knockback = item.knockBack,
                        CritChance = item.crit,
                        UseTime = item.useTime,
                        Defense = item.defense,
                        Value = item.value,
                        Rarity = item.rare,
                        IsHardmode = item.rare >= ItemRarityID.LightRed
                    },
                    Recipes = GetRecipesForItem(i),
                    ObtainedFromDrops = drops ?? new List<object>(),
                    ShimmerDecraft = GetShimmerResult(i)
                };

                allExportedItems.Add(itemData);
            }

            var groupedItems = allExportedItems.GroupBy(item => (string)((dynamic)item).ModSource);

            // Dynamically detect the Terraria engine version (e.g., maps "1.4.4.9" to "1.4.4")
            string baseVersion = Main.versionNumber.StartsWith("1.4.5") ? "1.4.5" : "1.4.4";

            foreach (var group in groupedItems)
            {
                string modName = group.Key;
                // Stamps the version directly into the filename
                string path = Path.Combine(Main.SavePath, $"Terraria_{modName}_{baseVersion}_Export.json");

                using (StreamWriter sw = new StreamWriter(path))
                using (JsonTextWriter writer = new JsonTextWriter(sw))
                {
                    writer.Formatting = Formatting.Indented;
                    JsonSerializer.CreateDefault().Serialize(writer, group.ToList());
                }
                Console.WriteLine($"[CI/CD] Exported {group.Count()} items to {modName}_{baseVersion}.json");
            }
        }

        private string DetermineCategory(Item item)
        {
            // 1. Equipment & Mobility
            if (item.wingSlot > 0) return "Wings";
            if (item.mountType != -1) return "Mount";
            if (item.dye > 0) return "Dye";
            if (item.accessory) return "Accessory";
            if (item.headSlot > 0) return "Helmet";
            if (item.bodySlot > 0) return "Chestplate";
            if (item.legSlot > 0) return "Leggings";

            // 2. Tools
            if (item.pick > 0) return "Pickaxe";
            if (item.axe > 0) return "Axe";
            if (item.hammer > 0) return "Hammer";
            if (item.fishingPole > 0) return "Fishing Pole";

            // 3. Weapons (Granular Damage Types)
            if (item.damage > 0 && item.useStyle != 0)
            {
                if (item.DamageType == DamageClass.Melee || item.DamageType == DamageClass.MeleeNoSpeed)
                {
                    if (ItemID.Sets.Yoyo[item.type]) return "Yoyo";
                    if (item.shoot > 0 && item.noMelee) return "Melee Projectile"; // Flails, Boomerangs, Spears
                    return "Sword";
                }
                if (item.DamageType == DamageClass.Ranged)
                {
                    if (item.useAmmo == AmmoID.Arrow) return "Bow";
                    if (item.useAmmo == AmmoID.Bullet) return "Gun";
                    if (item.useAmmo == AmmoID.Rocket) return "Launcher";
                    if (item.consumable) return "Consumable Ranged"; // Throwing knives, shurikens
                    return "Ranged Weapon";
                }
                if (item.DamageType == DamageClass.Magic) return "Magic Weapon";
                if (item.DamageType == DamageClass.Summon || item.DamageType == DamageClass.SummonMeleeSpeed)
                {
                    if (item.sentry) return "Sentry";
                    // TML internally tracks whips via their projectile flags
                    if (item.shoot > 0 && ProjectileID.Sets.IsAWhip[item.shoot]) return "Whip";
                    return "Summon Weapon";
                }
                return "Weapon";
            }

            // 4. Utilities & Items
            if (item.ammo != AmmoID.None) return "Ammunition";
            if (item.bait > 0) return "Bait";
            
            // 5. Consumables
            if (item.potion || item.healLife > 0 || item.healMana > 0) return "Potion";
            if (item.buffType > 0)
            {
                if (Main.vanityPet[item.buffType] || Main.lightPet[item.buffType]) return "Pet";
                return "Consumable";
            }
            if (ItemID.Sets.BossBag[item.type]) return "Treasure Bag";

            // 6. Placeables
            if (item.createTile > -1) return "Block / Furniture";
            if (item.createWall > -1) return "Wall";

            return "Material";
        }

        private string GenerateWikiUrl(string modSource, string displayName)
        {
            string urlName = displayName.Replace(" ", "_");
            if (modSource == "Vanilla") return $"https://terraria.wiki.gg/wiki/{urlName}";
            if (modSource == "CalamityMod") return $"https://calamitymod.wiki.gg/wiki/{urlName}";
            if (modSource == "FargowiltasSouls" || modSource == "Fargowiltas") return $"https://fargosmods.wiki.gg/wiki/{urlName}";
            return ""; 
        }

        private string GetShimmerResult(int itemId)
        {
            if (ItemID.Sets.ShimmerTransformToItem.Length > itemId)
            {
                int shimmerResult = ItemID.Sets.ShimmerTransformToItem[itemId];
                if (shimmerResult > 0) return Lang.GetItemNameValue(shimmerResult);
            }
            return null;
        }

        private List<object> GetRecipesForItem(int itemId)
        {
            var recipeList = new List<object>();
            var validRecipes = Main.recipe.Take(Recipe.numRecipes)
                .Where(r => r != null && r.createItem != null && r.createItem.type == itemId);

            foreach (Recipe recipe in validRecipes)
            {
                recipeList.Add(new {
                    Stations = recipe.requiredTile?.Select(t => TileLoader.GetTile(t)?.Name ?? TileID.Search.GetName(t) ?? t.ToString()).ToList() ?? new List<string>(),
                    Conditions = recipe.Conditions?.Select(c => c.Description.Value).ToList() ?? new List<string>(),
                    Ingredients = recipe.requiredItem?.Where(req => req != null && req.type > 0).Select<Item, object>(req => {
                        
                        string ingModSource = req.ModItem?.Mod?.Name ?? "Vanilla";
                        string ingDeterministicID = ingModSource == "Vanilla" 
                            ? req.type.ToString() 
                            : $"{ingModSource}_{req.ModItem?.Name ?? req.Name}".Replace(" ", "");

                        return new { 
                            ID = ingDeterministicID, 
                            Name = Lang.GetItemNameValue(req.type), 
                            Amount = req.stack 
                        };
                    }).ToList() ?? new List<object>()
                });
            }
            return recipeList;
        }
    }
}