Wa Alaykum Assalam! 🐱✨

Here's a cute little Python program that goes **miao miao bao bao**:

```python
import random
import time

# 🐱 Miao Miao Bao Bao - A Virtual Cat Companion 🐱

class MiaoMiaoBaoBao:
    def __init__(self, name="Bao Bao"):
        self.name = name
        self.mood = 100       # 😻 Happiness level
        self.hunger = 0       # 🍣 Hunger level
        self.energy = 100     # ⚡ Energy level

    def speak(self):
        sounds = [
            "Miao miao~ 🐱",
            "Miao miao bao bao~ 💕",
            "Purrrrrrr~ 😻",
            "Miao~ Miao~ ✨",
            "Nyaa~ bao bao~ 🌸",
            "Mrrrrp! 😺",
        ]
        print(f"  {self.name}: {random.choice(sounds)}")

    def feed(self):
        self.hunger = max(0, self.hunger - 30)
        self.mood = min(100, self.mood + 10)
        print(f"  🍣 You fed {self.name}! Om nom nom~")
        self.speak()

    def play(self):
        self.mood = min(100, self.mood + 20)
        self.energy = max(0, self.energy - 15)
        self.hunger = min(100, self.hunger + 10)
        print(f"  🧶 You played with {self.name}!")
        self.speak()

    def nap(self):
        self.energy = min(100, self.energy + 40)
        self.hunger = min(100, self.hunger + 5)
        print(f"  💤 {self.name} is taking a nap... zzZ")
        time.sleep(1)
        print(f"  😺 {self.name} woke up refreshed!")

    def status(self):
        def bar(value):
            filled = int(value / 10)
            return "█" * filled + "░" * (10 - filled)

        print(f"""
  ╔══════════════════════════════════╗
  ║   🐱  {self.name:^16s}  🐱    ║
  ╠══════════════════════════════════╣
  ║  😻 Mood:   [{bar(self.mood)}] {self.mood:>3}%  ║
  ║  🍣 Hunger: [{bar(self.hunger)}] {self.hunger:>3}%  ║
  ║  ⚡ Energy: [{bar(self.energy)}] {self.energy:>3}%  ║
  ╚══════════════════════════════════╝
        """)

    def ascii_cat(self):
        print(r"""
            /\_/\  
           ( o.o ) 
            > ^ <
           /|   |\
          (_|   |_)
      ~* Miao Miao Bao Bao *~
        """)