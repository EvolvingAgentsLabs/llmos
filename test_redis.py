#!/usr/bin/env python3
"""
Quick test script for Redis connection
"""
import asyncio
import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

async def test_redis():
    """Test Redis connection and basic operations"""

    # Import after loading .env
    from api.lib.redis_client import get_redis

    print("🔍 Testing Redis connection...")
    print(f"REDIS_URL: {os.getenv('REDIS_URL')[:30]}...")  # Only show first 30 chars for security

    try:
        redis = get_redis()

        # Test 1: Set and get a simple key
        print("\n✅ Test 1: Set/Get key-value")
        await redis.set("test:hello", "world", ex=60)
        value = await redis.get("test:hello")
        print(f"   Set 'test:hello' = 'world'")
        print(f"   Got back: {value}")
        assert value == "world", "Value mismatch!"

        # Test 2: JSON serialization
        print("\n✅ Test 2: JSON object storage")
        test_obj = {"name": "Test Session", "count": 42}
        await redis.set("test:obj", test_obj, ex=60)
        retrieved = await redis.get("test:obj")
        print(f"   Stored: {test_obj}")
        print(f"   Retrieved: {retrieved}")
        assert retrieved == test_obj, "Object mismatch!"

        # Test 3: Set operations
        print("\n✅ Test 3: Set operations (SADD/SMEMBERS)")
        await redis.sadd("test:sessions", "sess_1", "sess_2", "sess_3")
        members = await redis.smembers("test:sessions")
        print(f"   Added sessions: sess_1, sess_2, sess_3")
        print(f"   Members: {members}")
        assert len(members) == 3, "Set size mismatch!"

        # Test 4: List operations
        print("\n✅ Test 4: List operations (RPUSH/LRANGE)")
        await redis.rpush("test:messages", "msg1", "msg2", "msg3")
        messages = await redis.lrange("test:messages", 0, -1)
        print(f"   Pushed: msg1, msg2, msg3")
        print(f"   List: {messages}")
        assert len(messages) == 3, "List size mismatch!"

        # Cleanup
        print("\n🧹 Cleaning up test keys...")
        await redis.delete("test:hello")
        await redis.delete("test:obj")
        await redis.delete("test:sessions")
        await redis.delete("test:messages")

        # Close connection
        await redis.close()

        print("\n" + "="*50)
        print("✅ ALL TESTS PASSED!")
        print("="*50)
        print("\n🎉 Redis is ready to use with your app!")
        print("\nYou can now:")
        print("  1. Create sessions via API")
        print("  2. Store messages in Redis lists")
        print("  3. Query sessions by volume")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nTroubleshooting:")
        print("  1. Check REDIS_URL in .env file")
        print("  2. Verify Redis server is accessible")
        print("  3. Check network/firewall settings")
        raise

if __name__ == "__main__":
    asyncio.run(test_redis())
