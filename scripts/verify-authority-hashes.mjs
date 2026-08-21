import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const expected = {
	'AGENTS.md': 'b9d46302df7e9eabc561a7f2b17ad7776d6eccb15cd2bba11d64c1f9a00a2268',
	'CRM_IMPLEMENTATION_ROADMAP_v1.1.0.md':
		'e93232be0994cfd9f57be731cd9600395c41eb5f553097a479e97ddf96313f53',
	'POST_BUILD_PILOT_PROGRAMME.md':
		'0ca7d1991777c179a9db410fecdc32affa0e8113c40a526a69f8c14a23f5f7c3',
	'Small Business CRM — Complete Architecture, Domain & Implementation Blueprint v1.0.0.md':
		'485157d37a581b88342f2a0a0caaadd1e55b8780138a763bc0bbd212bfd5694e',
	'Phases/PHASE_00_ARCHITECTURE_PRODUCT_CONTRACT.md':
		'ee83166b983b38c0574b541c3cc2c78c29831d387977788568c9d1d7a89557cd',
	'Phases/PHASE_01_PROJECT_SCAFFOLD_QUALITY_GATES.md':
		'7409d8f41f3efa935d6fc24c38456eee10bb4fd3e907491ec2064c7a38c57930',
	'Phases/PHASE_02_DESIGN_SYSTEM_APPLICATION_SHELL.md':
		'55da639e434b2c1630c74b96fdb4db1c872fa7271dfcdaf0f10ebb430b0366bd',
	'Phases/PHASE_03_DATABASE_IDENTITY_PERMISSIONS_RLS.md':
		'5bdfba806d52fab0c655431ea7057c16e67e72dc07166cb5d03bafe67f5e85e5',
	'Phases/PHASE_04_COMPLETE_CRM_TRACER_BULLET.md':
		'946ab41f5488c1a635d349d11a65ff281bbc23321d2d55e3cb891a31ef2c2276',
	'Phases/PHASE_05_LEAD_MANAGEMENT_HARDENING.md':
		'48a565ce5078a8e334a08dac392154dae853bb4ded6e5bec68a96f0706d52e85',
	'Phases/PHASE_06_CLIENT_CONTACT_DOMAIN.md':
		'b5f4a413523e68e0909ffad2370f421dbffccc46efb02bd87b87ffa429338a95',
	'Phases/PHASE_07_QUOTE_DOMAIN_QUOTE_EDITOR.md':
		'84bfce60ba2536f38754a849f624c6c39dfdb94b21b39112945e0f7125ecb169',
	'Phases/PHASE_08_DOCUMENTS_COMMUNICATIONS.md':
		'23b9c3a489a9737f45c3d1b3326f6985178f5a254197f53310bfbc9758ff281c',
	'Phases/PHASE_09_TASKS_FOLLOW_UPS_AUTOMATION.md':
		'2377df7b27bf239ad61b4b0b67f572deadd9d941521f9eca01f30d2a9205eae5',
	'Phases/PHASE_10_DASHBOARD_ANALYTICS.md':
		'da7de2430dc39d41fe1f474d7b9a8fed83bbbae3949a275a91ed3c62c22fa721',
	'Phases/PHASE_11_UX_REALTIME_PERFORMANCE_HARDENING.md':
		'c76c146a4497d0fbdb1cd373909ed15b2ae12eb8a9101cd345b5f99eee0e6653',
	'Phases/PHASE_12_SECURITY_BACKUP_OPERATIONAL_HARDENING.md':
		'c451707c52a8c6aeaa070dfff80c780f1e8da25ecda04212a3d79646a5b4a7c7',
	'Phases/PHASE_13_REUSABLE_CLIENT_DEPLOYMENT_TEMPLATE.md':
		'626e06eab812025d7f899149a179a36ea869337d64c3502f061b5432468cf2d0',
	'Phases/PHASE_14_LOCAL_RELEASE_CANDIDATE_PILOT_READINESS.md':
		'6874531f5213a55ca45308da364daad62b6c3a000318ac9af9f6c63b12379b0e',
	'docs/ARCHITECTURE.md': '48991ca7d52d6c31e3b2628457f49df090cc889fcb8e3cb75d57c642e2899145',
	'docs/DOMAIN_MODEL.md': 'a86574a6ac8b89e10d5623fa12f8c4b47c35dc24eb8241ce97291d34ff2ec684',
	'docs/STATE_MACHINES.md': 'f599588db309b632068f643b95f8b87a875d521b400160bd316ebcbc2d987557',
	'docs/SECURITY_MODEL.md': '6f44951663bc0a70a94646e69e5cd1086e86586ec9d2c66dc769cd84d2d4ef01',
	'docs/ROADMAP.md': 'f54344264767ab820c713a1bdeb67f9a45cbfab85482b7ed677b76b3a167bfbc'
};

for (const [path, expectedHash] of Object.entries(expected)) {
	const actualHash = createHash('sha256')
		.update(await readFile(path))
		.digest('hex');
	if (actualHash !== expectedHash) {
		throw new Error(
			`Authority drift detected in ${path}: expected ${expectedHash}, got ${actualHash}`
		);
	}
}

console.log(`Authority hash verification passed for ${Object.keys(expected).length} files.`);
