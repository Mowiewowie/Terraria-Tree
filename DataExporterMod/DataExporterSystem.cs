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

            // 1. GLOBAL ENEMY DROPS
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
                    DropChance = Math.Round(dropInfo.dropRate * 100, 2) + "%", // Normalized to string percentage
                    Conditions = dropInfo.conditions?.Select(c => c?.GetConditionDescription() ?? "").Where(c => !string.IsNullOrEmpty(c)).ToList()
                });
            }

            // 2. SPECIFIC NPC DROPS
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
                        SourceNPC_Name = "NPC: " + (Lang.GetNPCNameValue(npcId) ?? "Unknown Entity"),
                        DropChance = Math.Round(dropInfo.dropRate * 100, 2) + "%",
                        Conditions = dropInfo.conditions?.Select(c => c?.GetConditionDescription() ?? "").Where(c => !string.IsNullOrEmpty(c)).ToList()
                    });
                }
            }

            // 3. NPC SHOP DATABASE (Replaces "Sold By" Wiki scraping)
            foreach (var shop in NPCShopDatabase.AllShops)
            {
                int npcId = shop.NpcType;
                string npcName = Lang.GetNPCNameValue(npcId) ?? "Unknown NPC";

                foreach (var entry in shop.ActiveEntries)
                {
                    int itemId = entry.Item.type;
                    
                    List<string> shopConditions = new List<string>();
                    if (entry.Conditions != null)
                    {
                        foreach(var condition in entry.Conditions) 
                        {
                            if (!string.IsNullOrEmpty(condition.Description.Value))
                            {
                                shopConditions.Add(condition.Description.Value);
                            }
                        }
                    }

                    if (!dropMap.ContainsKey(itemId)) dropMap[itemId] = new List<object>();

                    dropMap[itemId].Add(new {
                        SourceNPC_ID = npcId,
                        SourceNPC_Name = "Shop: " + npcName,
                        DropChance = "100%", // Shops are always guaranteed when conditions are met
                        Conditions = shopConditions
                    });
                }
            }

            // 4. ITEM DROPS (Replaces "Found In" Wiki scraping for Crates and Boss Bags)
            for (int itemId = 1; itemId < ItemLoader.ItemCount; itemId++)
            {
                var rules = Main.ItemDropsDB.GetRulesForItemID(itemId);
                if (rules == null || !rules.Any()) continue;

                var dropRates = new List<DropRateInfo>();
                foreach (var rule in rules) rule.ReportDroprates(dropRates, feed);

                string containerName = Lang.GetItemNameValue(itemId) ?? "Unknown Container";

                foreach (var dropInfo in dropRates)
                {
                    if (!dropMap.ContainsKey(dropInfo.itemId)) dropMap[dropInfo.itemId] = new List<object>();
                    dropMap[dropInfo.itemId].Add(new {
                        SourceNPC_ID = -1,
                        SourceNPC_Name = "Chest/Crate/Bag: " + containerName,
                        DropChance = Math.Round(dropInfo.dropRate * 100, 2) + "%",
                        Conditions = dropInfo.conditions?.Select(c => c?.GetConditionDescription() ?? "").Where(c => !string.IsNullOrEmpty(c)).ToList()
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

                // Extract the base tooltip (flavor text/description)
                string tooltipText = "";
                var tt = Lang.GetTooltip(i);
                
                // Modern tModLoader tooltips are arrays of strings. We join them with a space.
                if (tt != null && tt.Lines > 0) 
                {
                    string[] lines = new string[tt.Lines];
                    for (int lineIndex = 0; lineIndex < tt.Lines; lineIndex++)
                    {
                        lines[lineIndex] = tt.GetLine(lineIndex);
                    }
                    
                    // Join the array into a single clean string and trim any excess whitespace
                    tooltipText = string.Join(" ", lines).Trim();
                }

                var itemData = new {
                    ID = deterministicID,
                    InternalName = item.ModItem?.Name ?? item.Name,
                    DisplayName = displayName,
                    ModSource = modSourceName,
                    Category = DetermineCategory(item),
                    Tooltip = tooltipText,
                    WikiUrl = GenerateWikiUrl(modSourceName, displayName),
                    IconUrl = GenerateIconUrl(modSourceName, displayName),
                    
                    // Difficulty & Progression Flags
                    IsHardmode = item.rare >= ItemRarityID.LightRed,
                    IsExpert = item.expert || item.expertOnly,
                    IsMaster = item.master,
                    
                    Stats = new {
                        MaxStack = item.maxStack,
                        Damage = item.damage,
                        DamageClass = item.DamageType?.DisplayName?.Value ?? item.DamageType?.Name ?? "Default",
                        Knockback = item.knockBack,
                        CritChance = item.crit,
                        UseTime = item.useTime,
                        Velocity = item.shootSpeed,
                        ManaCost = item.mana,
                        AutoReuse = item.autoReuse,
                        Consumable = item.consumable,
                        Defense = item.defense,
                        Value = new {
                            Raw = item.value,
                            Platinum = item.value / 1000000,
                            Gold = item.value / 10000 % 100,
                            Silver = item.value / 100 % 100,
                            Copper = item.value % 100
                        },
                        Rarity = item.rare,
                        
                        // Tool Powers
                        ToolPower = new {
                            Pickaxe = item.pick,
                            Axe = item.axe * 5, // The UI multiplies internal axe power by 5
                            Hammer = item.hammer
                        }
                    },
                    Recipes = GetRecipesForItem(i),
                    ObtainedFromDrops = drops ?? new List<object>(),
                    ShimmerDecraft = GetShimmerResult(i)
                };

                allExportedItems.Add(itemData);
            }

            // Dynamically determine the environment name based on which mods are currently loaded
            bool hasCalamity = ModLoader.TryGetMod("CalamityMod", out _);
            bool hasFargo = ModLoader.TryGetMod("Fargowiltas", out _);
            
            string envName = "Vanilla";
            if (hasCalamity && hasFargo) envName = "All";
            else if (hasCalamity) envName = "Vanilla_Calamity";
            else if (hasFargo) envName = "Vanilla_Fargowiltas";

            string baseVersion = Main.versionNumber.StartsWith("1.4.5") ? "1.4.5" : "1.4.4";
            string path = Path.Combine(Main.SavePath, $"Terraria_{envName}_{baseVersion}_Export.json");

            using (StreamWriter sw = new StreamWriter(path))
            using (JsonTextWriter writer = new JsonTextWriter(sw))
            {
                writer.Formatting = Formatting.Indented;
                JsonSerializer.CreateDefault().Serialize(writer, allExportedItems);
            }
            
            Console.WriteLine($"[CI/CD] Exported {allExportedItems.Count} items to {envName}_{baseVersion}.json");
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

            // 3. Weapons
            if (item.damage > 0 && item.useStyle != 0)
            {
                if (item.DamageType == DamageClass.Melee || item.DamageType == DamageClass.MeleeNoSpeed)
                {
                    if (ItemID.Sets.Yoyo[item.type]) return "Yoyo";
                    if (item.shoot > 0 && item.noMelee) return "Melee Projectile";
                    return "Sword";
                }
                if (item.DamageType == DamageClass.Ranged)
                {
                    if (item.useAmmo == AmmoID.Arrow) return "Bow";
                    if (item.useAmmo == AmmoID.Bullet) return "Gun";
                    if (item.useAmmo == AmmoID.Rocket) return "Launcher";
                    if (item.consumable) return "Consumable Ranged";
                    return "Ranged Weapon";
                }
                if (item.DamageType == DamageClass.Magic) return "Magic Weapon";
                if (item.DamageType == DamageClass.Summon || item.DamageType == DamageClass.SummonMeleeSpeed)
                {
                    if (item.sentry) return "Sentry";
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
            if (modSource == "Vanilla" || modSource == "ModLoader") return $"https://terraria.wiki.gg/wiki/{urlName}";
            if (modSource == "CalamityMod" || modSource == "CalamityModMusic") return $"https://calamitymod.wiki.gg/wiki/{urlName}";
            if (modSource == "FargowiltasSouls" || modSource == "Fargowiltas") return $"https://fargosmods.wiki.gg/wiki/{urlName}";
            return ""; 
        }

        private string GenerateIconUrl(string modSource, string displayName)
        {
            // Replace spaces with underscores to match your downloaded local filenames
            string fileName = displayName.Replace(" ", "_") + ".png";
            
            // Route everything to your web application's root sprites folder
            return $"/sprites/{fileName}";
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