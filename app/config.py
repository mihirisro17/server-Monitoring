# class Config:
#     SECRET_KEY = "your-secret-key"
#     CACHE_TIMEOUT = 30  # seconds

#     # Group your servers by category
#     SERVER_GROUPS = {
#         "data": [
#             {
#                 "name": "2.67 - V1CS9",
#                 "ip": "192.168.2.67",
#                 "username": "isro",
#                 "password": "admin@123",
#             },
#             {
#                 "name": "2.135 - V1C1",
#                 "ip": "192.168.2.135",
#                 "username": "download_user",
#                 "password": "Vedas@123",
#             },
#             {
#                 "name": "2.68 - V1CS10",
#                 "ip": "192.168.2.68",
#                 "username": "sambauser",
#                 "password": "samba@123",
#             }
#             # {"name": "2.149", "ip": "192.168.2.19", "username": "sc", "password": "s@123"},
#             # Add more data servers...
#         ],
#         "deployment": [
#             {
#                 "name": "2.64 - V1CS7",
#                 "ip": "192.168.2.64",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.65 - V1CS2",
#                 "ip": "192.168.2.65",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.145 - V1CS1",
#                 "ip": "192.168.2.145",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.146 - V1CS2",
#                 "ip": "192.168.2.146",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.147 - V1CS3",
#                 "ip": "192.168.2.147",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.148 - V1CS4",
#                 "ip": "192.168.2.148",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.149 - V1CS5",
#                 "ip": "192.168.2.149",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.150 - V1CS6",
#                 "ip": "192.168.2.150",
#                 "username": "sac",
#                 "password": "sac@123",
#             }
#             # Add deployment servers...
#         ],
#         "stagging": [
#             {
#                 "name": "2.137 - V1C3",
#                 "ip": "192.168.2.137",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.61 - V1C20",
#                 "ip": "192.168.2.61",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             {
#                 "name": "2.62 - V1C4",
#                 "ip": "192.168.2.62",
#                 "username": "sac",
#                 "password": "sac123",
#             },
#             {
#                 "name": "2.146 - V1CS2",
#                 "ip": "192.168.2.146",
#                 "username": "sac",
#                 "password": "sac@123",
#             }
#             # Add staging servers...
#         ],
#         "gpus": [
#             {
#                 "name": "213 - V100 - V1G2",
#                 "ip": "192.168.2.213",
#                 "username": "sac",
#                 "password": "sac123",
#             },
#             {
#                 "name": "214 - V100 - V1G3",
#                 "ip": "192.168.2.214",
#                 "username": "sac",
#                 "password": "sac123",
#             },
#             {
#                 "name": "231 - H100 - V1G1",
#                 "ip": "192.168.2.231",
#                 "username": "sac",
#                 "password": "sac@123",
#             },
#             # Add GPU servers...
#         ],
#         "nginx": [
#             {
#                 "name": "2.138 - V1C19",
#                 "ip": "192.168.2.138",
#                 "username": "sac",
#                 "password": "sac@123",
#             },{
#                 "name": "2.38 - V1C7",
#                 "ip": "192.168.2.38",
#                 "username": "sac",
#                 "password": "sac123",
#             }

#             # Add nginx servers...
#         ],
#         "development": [
#         ],
#     }


#     # Flatten servers list for backward compatibility
#     SERVERS = [server for group in SERVER_GROUPS.values() for server in group]
class Config:
    SECRET_KEY = "your-secret-key-change-in-production"
    CACHE_TIMEOUT = 30  # seconds
    IP_NAME_MAP = {
        "192.168.2.202": "Mihir",
        "192.168.2.220": "Harish",
        "192.168.2.141": "Vikrant",
        "192.168.2.221": "Karnav",
        "192.168.2.205": "Vidit",
        "192.168.2.210": "Arpan",
        "192.168.2.206": "Krishna",
        # Add more mappings as needed
    }

    # Server Groups Configuration
    SERVER_GROUPS = {
        "data": [
            {
                "name": "2.67 - V1CS9",
                "ip": "192.168.2.67",
                "username": "isro",
                "password": "admin@123",
            },
            {
                "name": "2.135 - V1C1",
                "ip": "192.168.2.135",
                "username": "download_user",
                "password": "Vedas@123",
            },
            {
                "name": "2.68 - V1CS10",
                "ip": "192.168.2.68",
                "username": "sambauser",
                "password": "samba@123",
            },
            # {"name": "2.149", "ip": "192.168.2.19", "username": "sc", "password": "s@123"},
            # Add more data servers...
        ],
        "deployment": [
            {
                "name": "2.64 - V1CS7",
                "ip": "192.168.2.64",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.65 - V1CS2",
                "ip": "192.168.2.65",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.145 - V1CS1",
                "ip": "192.168.2.145",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.147 - V1CS3",
                "ip": "192.168.2.147",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.148 - V1CS4",
                "ip": "192.168.2.148",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.149 - V1CS5",
                "ip": "192.168.2.149",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.150 - V1CS6",
                "ip": "192.168.2.150",
                "username": "sac",
                "password": "sac@123",
            },
            # Add deployment servers...
        ],
        "stagging": [
            {
                "name": "2.137 - V1C3",
                "ip": "192.168.2.137",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.61 - V1C20",
                "ip": "192.168.2.61",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.62 - V1C4",
                "ip": "192.168.2.62",
                "username": "sac",
                "password": "sac123",
            },
            {
                "name": "2.146 - V1CS2",
                "ip": "192.168.2.146",
                "username": "sac",
                "password": "sac@123",
            },
            {
                "name": "2.136 - V1C2",
                "ip": "192.168.2.136",
                "username": "sac",
                "password": "sac@123",
            },
            # Add staging servers...
        ],
        "gpus": [
            {
                "name": "213 - V100 - V1G2",
                "ip": "192.168.2.213",
                "username": "sac",
                "password": "sac123",
                "group": "gpus",
            },
            {
                "name": "214 - V100 - V1G3",
                "ip": "192.168.2.214",
                "username": "sac",
                "password": "sac123",
                "group": "gpus",
            },
            {
                "name": "231 - H100 - V1G1",
                "ip": "192.168.2.231",
                "username": "sac",
                "password": "sac@123",
                "group": "gpus",
            },
            # Add GPU servers...
        ],
        "nginx": [
            {
                "name": "2.138 - V1C19",
                "ip": "192.168.2.138",
                "username": "sac",
                "password": "sac@123",
            },
            # {
            #     "name": "2.38 - V1C7",
            #     "ip": "192.168.2.38",
            #     "username": "sac",
            #     "password": "sac123",
            # }
            # Add nginx servers...
        ],
        "development": [],
    }

    # Flatten servers list for easy access
    SERVERS = []
    for group_name, servers in SERVER_GROUPS.items():
        for server in servers:
            server["group"] = group_name
            SERVERS.append(server)

    # Alert Thresholds
    THRESHOLDS = {
        "cpu": {"warning": 70, "critical": 90},
        "memory": {"warning": 75, "critical": 90},
        "storage": {"warning": 80, "critical": 90},
        "load_avg": {"warning": 2.0, "critical": 4.0},
    }
